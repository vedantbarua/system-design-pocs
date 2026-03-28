package com.randomproject.distributedtracing;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import java.util.stream.Collectors;

@Service
public class DistributedTracingService {
    private static final List<String> FLOW = List.of(
            "api-gateway",
            "checkout-service",
            "inventory-service",
            "payment-service",
            "notification-service");

    private static final Map<String, String> OPERATIONS = Map.of(
            "api-gateway", "POST /checkout",
            "checkout-service", "CreateOrder",
            "inventory-service", "ReserveInventory",
            "payment-service", "AuthorizePayment",
            "notification-service", "SendConfirmation");

    private final LongSupplier clock;
    private final Map<String, TraceView> traces = new ConcurrentHashMap<>();

    public DistributedTracingService() {
        this(System::currentTimeMillis, true);
    }

    DistributedTracingService(LongSupplier clock, boolean seedData) {
        this.clock = clock;
        if (seedData) {
            seed();
        }
    }

    public synchronized SnapshotView snapshot() {
        List<TraceView> traceViews = listTraces();
        List<ServiceMetricView> serviceMetrics = computeServiceMetrics(traceViews);
        long broken = traceViews.stream().filter(TraceView::propagationBroken).count();
        long errors = traceViews.stream().filter(trace -> trace.status() == SpanStatus.ERROR).count();
        return new SnapshotView(
                traceViews.size(),
                broken,
                errors,
                serviceMetrics.size(),
                traceViews.isEmpty() ? null : traceViews.get(0),
                serviceMetrics,
                traceViews);
    }

    public synchronized List<TraceView> listTraces() {
        return traces.values().stream()
                .sorted(Comparator.comparingLong(TraceView::startedAtMs).reversed())
                .toList();
    }

    public synchronized TraceView getTrace(String traceId) {
        TraceView trace = traces.get(traceId);
        if (trace == null) {
            throw new IllegalArgumentException("Unknown trace: " + traceId);
        }
        return trace;
    }

    public synchronized List<ServiceMetricView> serviceMetrics() {
        return computeServiceMetrics(listTraces());
    }

    public synchronized SimulationResult simulate(SimulationRequest request) {
        validateRequest(request);

        long startedAt = clock.getAsLong();
        String normalizedBreak = normalizeBreakTarget(request.breakPropagationAt());
        String primaryTraceId = traceId();
        TraceBuilder primary = new TraceBuilder(primaryTraceId, request.flowName(), "api-gateway", startedAt);
        List<String> detachedTraceIds = new ArrayList<>();

        long offset = 0L;
        SpanSeed gateway = spanSeed(primaryTraceId, null, "api-gateway", startedAt + offset, 18,
                Map.of("http.method", "POST", "http.route", "/checkout", "user.id", request.userId(), "region", request.region()),
                List.of(log(startedAt + offset, "INFO", "Inbound request accepted at edge.")),
                SpanStatus.OK);
        primary.add(gateway);
        offset += gateway.durationMs() + 3;

        SpanSeed checkout = spanSeed(primaryTraceId, gateway.spanId(), "checkout-service", startedAt + offset, 24,
                Map.of("checkout.flow", request.flowName(), "user.id", request.userId()),
                List.of(log(startedAt + offset, "INFO", "Checkout orchestration started.")),
                SpanStatus.OK);
        primary.add(checkout);
        offset += checkout.durationMs() + 4;

        int breakIndex = normalizedBreak == null ? -1 : FLOW.indexOf(normalizedBreak);
        TraceBuilder active = primary;
        String parentSpanId = checkout.spanId();
        String activeTraceId = primaryTraceId;

        if (breakIndex >= 2) {
            String detachedTraceId = traceId();
            detachedTraceIds.add(detachedTraceId);
            primary.anomalies.add("Trace context was dropped before " + normalizedBreak + ".");
            primary.propagationBroken = true;
            active = new TraceBuilder(detachedTraceId, request.flowName() + " detached", normalizedBreak, startedAt + offset);
            active.propagationBroken = true;
            active.anomalies.add("Started a second root span at " + normalizedBreak + " due to missing trace headers.");
            activeTraceId = detachedTraceId;
            parentSpanId = null;
        }

        if (breakIndex == 2 || breakIndex < 0) {
            SpanSeed inventory = spanSeed(activeTraceId, parentSpanId, "inventory-service", startedAt + offset, 14,
                    Map.of("sku", "sku-42", "reservation.status", "reserved"),
                    List.of(log(startedAt + offset, "INFO", "Inventory reserved for order.")),
                    SpanStatus.OK);
            active.add(inventory);
            offset += inventory.durationMs() + 5;
            parentSpanId = inventory.spanId();
        }

        if (breakIndex == 3) {
            String detachedTraceId = traceId();
            detachedTraceIds.add(detachedTraceId);
            primary.anomalies.add("Trace context dropped before payment-service.");
            primary.propagationBroken = true;
            TraceBuilder detached = new TraceBuilder(detachedTraceId, request.flowName() + " detached", "payment-service", startedAt + offset);
            detached.propagationBroken = true;
            detached.anomalies.add("Payment span started without parent trace context.");
            active = detached;
            activeTraceId = detachedTraceId;
            parentSpanId = null;
        }

        SpanStatus paymentStatus = request.paymentFails() ? SpanStatus.ERROR : SpanStatus.OK;
        List<TraceLogEntry> paymentLogs = new ArrayList<>();
        paymentLogs.add(log(startedAt + offset, "INFO", "Payment authorization requested."));
        if (request.paymentFails()) {
            paymentLogs.add(log(startedAt + offset + 8, "ERROR", "Downstream PSP timeout while authorizing card."));
        }
        SpanSeed payment = spanSeed(activeTraceId, parentSpanId, "payment-service", startedAt + offset,
                request.paymentFails() ? 31 : 21,
                Map.of("psp", "mock-pay", "currency", "USD", "amount", "149.99"),
                paymentLogs,
                paymentStatus);
        active.add(payment);
        offset += payment.durationMs() + 4;
        parentSpanId = payment.spanId();

        if (!request.paymentFails()) {
            if (breakIndex == 4) {
                String detachedTraceId = traceId();
                detachedTraceIds.add(detachedTraceId);
                primary.anomalies.add("Trace context dropped before notification-service.");
                primary.propagationBroken = true;
                TraceBuilder detached = new TraceBuilder(detachedTraceId, request.flowName() + " detached", "notification-service", startedAt + offset);
                detached.propagationBroken = true;
                detached.anomalies.add("Notification span emitted as an orphan span.");
                active = detached;
                activeTraceId = detachedTraceId;
                parentSpanId = null;
            }

            SpanSeed notification = spanSeed(activeTraceId, parentSpanId, "notification-service", startedAt + offset, 9,
                    Map.of("channel", "email", "template", "checkout-confirmation"),
                    List.of(log(startedAt + offset, "INFO", "Confirmation queued for delivery.")),
                    SpanStatus.OK);
            active.add(notification);
        } else {
            active.anomalies.add("Notification span was never emitted because payment failed.");
        }

        List<TraceView> built = new ArrayList<>();
        built.add(primary.build());
        if (active != primary) {
            built.add(active.build());
        }
        for (String detachedTraceId : detachedTraceIds) {
            if (built.stream().noneMatch(trace -> trace.traceId().equals(detachedTraceId))) {
                throw new IllegalStateException("Detached trace was declared but not built: " + detachedTraceId);
            }
        }

        built.forEach(trace -> traces.put(trace.traceId(), trace));

        return new SimulationResult(
                primaryTraceId,
                detachedTraceIds,
                built.size(),
                detachedTraceIds.isEmpty()
                        ? "Created trace " + primaryTraceId + " with full propagation."
                        : "Created trace " + primaryTraceId + " and " + detachedTraceIds.size() + " detached trace(s) due to broken propagation.");
    }

    public synchronized void reset() {
        traces.clear();
        seed();
    }

    private void seed() {
        simulate(new SimulationRequest("checkout", "user-101", "us-central", false, null));
        simulate(new SimulationRequest("checkout", "user-202", "eu-west", true, null));
        simulate(new SimulationRequest("checkout", "user-303", "ap-south", false, "inventory-service"));
    }

    private void validateRequest(SimulationRequest request) {
        if (request.flowName() == null || request.flowName().isBlank()) {
            throw new IllegalArgumentException("flowName is required.");
        }
        if (request.userId() == null || request.userId().isBlank()) {
            throw new IllegalArgumentException("userId is required.");
        }
        if (request.region() == null || request.region().isBlank()) {
            throw new IllegalArgumentException("region is required.");
        }
        normalizeBreakTarget(request.breakPropagationAt());
    }

    private String normalizeBreakTarget(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        if (!FLOW.contains(normalized) || "api-gateway".equals(normalized) || "checkout-service".equals(normalized)) {
            throw new IllegalArgumentException("breakPropagationAt must be one of inventory-service, payment-service, notification-service.");
        }
        return normalized;
    }

    private List<ServiceMetricView> computeServiceMetrics(List<TraceView> traceViews) {
        Map<String, List<SpanView>> spansByService = new LinkedHashMap<>();
        Map<String, Long> activeTraces = new LinkedHashMap<>();
        for (TraceView trace : traceViews) {
            LinkedHashSet<String> seen = new LinkedHashSet<>();
            for (SpanView span : trace.spans()) {
                spansByService.computeIfAbsent(span.serviceName(), ignored -> new ArrayList<>()).add(span);
                if (seen.add(span.serviceName())) {
                    activeTraces.merge(span.serviceName(), 1L, Long::sum);
                }
            }
        }

        return spansByService.entrySet().stream()
                .map(entry -> {
                    List<SpanView> spans = entry.getValue();
                    List<Long> durations = spans.stream().map(SpanView::durationMs).sorted().toList();
                    long errorCount = spans.stream().filter(span -> span.status() == SpanStatus.ERROR).count();
                    double avg = spans.stream().mapToLong(SpanView::durationMs).average().orElse(0.0);
                    long p95 = durations.isEmpty() ? 0 : durations.get((int) Math.min(durations.size() - 1, Math.ceil(durations.size() * 0.95) - 1));
                    return new ServiceMetricView(
                            entry.getKey(),
                            spans.size(),
                            errorCount,
                            Math.round(avg * 10.0) / 10.0,
                            p95,
                            activeTraces.getOrDefault(entry.getKey(), 0L));
                })
                .sorted(Comparator.comparing(ServiceMetricView::serviceName))
                .toList();
    }

    private SpanSeed spanSeed(
            String traceId,
            String parentSpanId,
            String serviceName,
            long startTimeMs,
            long durationMs,
            Map<String, String> attributes,
            List<TraceLogEntry> logs,
            SpanStatus status) {
        return new SpanSeed(
                traceId,
                spanId(),
                parentSpanId,
                serviceName,
                OPERATIONS.getOrDefault(serviceName, serviceName),
                status,
                startTimeMs,
                startTimeMs + durationMs,
                durationMs,
                new LinkedHashMap<>(attributes),
                logs);
    }

    private TraceLogEntry log(long epochMs, String level, String message) {
        return new TraceLogEntry(
                DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(Instant.ofEpochMilli(epochMs).atOffset(ZoneOffset.UTC)),
                level,
                message);
    }

    private String traceId() {
        return "tr-" + UUID.randomUUID().toString().replace("-", "").substring(0, 16);
    }

    private String spanId() {
        return "sp-" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private static final class TraceBuilder {
        private final String traceId;
        private final String flowName;
        private final String rootService;
        private final long startedAtMs;
        private final List<SpanView> spans = new ArrayList<>();
        private final List<String> anomalies = new ArrayList<>();
        private boolean propagationBroken;

        private TraceBuilder(String traceId, String flowName, String rootService, long startedAtMs) {
            this.traceId = traceId;
            this.flowName = flowName;
            this.rootService = rootService;
            this.startedAtMs = startedAtMs;
        }

        private void add(SpanSeed seed) {
            spans.add(new SpanView(
                    seed.traceId(),
                    seed.spanId(),
                    seed.parentSpanId(),
                    seed.serviceName(),
                    seed.operation(),
                    seed.status(),
                    seed.startTimeMs(),
                    seed.endTimeMs(),
                    seed.durationMs(),
                    Map.copyOf(seed.attributes()),
                    List.copyOf(seed.logs())));
        }

        private TraceView build() {
            if (spans.isEmpty()) {
                throw new IllegalStateException("Cannot build an empty trace.");
            }
            long firstStart = spans.stream().mapToLong(SpanView::startTimeMs).min().orElse(startedAtMs);
            long lastEnd = spans.stream().mapToLong(SpanView::endTimeMs).max().orElse(startedAtMs);
            SpanStatus traceStatus = spans.stream().anyMatch(span -> span.status() == SpanStatus.ERROR) ? SpanStatus.ERROR : SpanStatus.OK;
            List<String> services = spans.stream()
                    .map(SpanView::serviceName)
                    .filter(Objects::nonNull)
                    .distinct()
                    .collect(Collectors.toList());
            return new TraceView(
                    traceId,
                    flowName,
                    rootService,
                    traceStatus,
                    firstStart,
                    lastEnd - firstStart,
                    propagationBroken,
                    services,
                    List.copyOf(anomalies),
                    List.copyOf(spans));
        }
    }

    private record SpanSeed(
            String traceId,
            String spanId,
            String parentSpanId,
            String serviceName,
            String operation,
            SpanStatus status,
            long startTimeMs,
            long endTimeMs,
            long durationMs,
            Map<String, String> attributes,
            List<TraceLogEntry> logs
    ) {
    }
}
