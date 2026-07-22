package com.randomproject.cdcmaterializedview;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;

@Service
public class CdcMaterializedViewService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");

    private final Map<String, OrderRow> sourceOrders = new LinkedHashMap<>();
    private final List<ChangeEvent> changeLog = new ArrayList<>();
    private final Map<String, OrderProjection> orderSummaryProjection = new LinkedHashMap<>();
    private final Map<String, SearchDocument> searchIndexProjection = new LinkedHashMap<>();
    private final Set<Long> appliedSequences = new LinkedHashSet<>();
    private final Deque<String> recentEvents = new ArrayDeque<>();
    private final int defaultBatchSize;
    private final int historyLimit;
    private boolean paused;
    private long orderSequence;
    private long changeSequence;
    private long committedOffset;
    private int processedEvents;
    private int duplicateEvents;

    @Autowired
    public CdcMaterializedViewService(
            @Value("${cdc.default-batch-size:5}") int defaultBatchSize,
            @Value("${cdc.history-limit:24}") int historyLimit) {
        this(defaultBatchSize, historyLimit, true);
    }

    CdcMaterializedViewService(int defaultBatchSize, int historyLimit, boolean seedData) {
        this.defaultBatchSize = Math.max(1, defaultBatchSize);
        this.historyLimit = Math.max(6, historyLimit);
        if (seedData) {
            seed();
            poll(new PollRequest(100));
            addEvent("Bootstrapped source orders and caught projections up to offset " + committedOffset + ".");
        }
    }

    public synchronized SystemSnapshot snapshot() {
        return toSnapshot();
    }

    public synchronized CommandResult createOrder(CreateOrderRequest request) {
        String customerId = normalizeId(request.customerId(), "customerId", 60);
        String sku = normalizeId(request.sku(), "sku", 60);
        int quantity = normalizeQuantity(request.quantity());
        BigDecimal unitPrice = normalizeMoney(request.unitPrice(), "unitPrice");
        String orderId = "order-" + (++orderSequence);
        OrderRow row = new OrderRow(orderId, customerId, sku, quantity, unitPrice, OrderStatus.CREATED, 1, false);
        sourceOrders.put(orderId, row);
        appendChange(ChangeOperation.INSERT, row, false, "table-write");
        addEvent("Inserted " + orderId + " for " + customerId + ".");
        return new CommandResult("Created " + orderId + ".", toSnapshot());
    }

    public synchronized CommandResult updateOrder(String orderId, UpdateOrderRequest request) {
        String normalizedOrderId = normalizeId(orderId, "orderId", 60);
        OrderRow existing = requireOrder(normalizedOrderId);
        if (existing.deleted) {
            throw new IllegalArgumentException("Order " + normalizedOrderId + " is deleted.");
        }
        String sku = request.sku() == null || request.sku().isBlank()
                ? existing.sku
                : normalizeId(request.sku(), "sku", 60);
        int quantity = request.quantity() == null ? existing.quantity : normalizeQuantity(request.quantity());
        BigDecimal unitPrice = request.unitPrice() == null ? existing.unitPrice : normalizeMoney(request.unitPrice(), "unitPrice");
        OrderStatus status = request.status() == null ? existing.status : request.status();
        OrderRow updated = new OrderRow(
                existing.orderId,
                existing.customerId,
                sku,
                quantity,
                unitPrice,
                status,
                existing.rowVersion + 1,
                false);
        sourceOrders.put(normalizedOrderId, updated);
        appendChange(ChangeOperation.UPDATE, updated, false, "table-write");
        addEvent("Updated " + normalizedOrderId + " to " + status + ".");
        return new CommandResult("Updated " + normalizedOrderId + ".", toSnapshot());
    }

    public synchronized CommandResult deleteOrder(String orderId) {
        String normalizedOrderId = normalizeId(orderId, "orderId", 60);
        OrderRow existing = requireOrder(normalizedOrderId);
        if (existing.deleted) {
            throw new IllegalArgumentException("Order " + normalizedOrderId + " is already deleted.");
        }
        OrderRow deleted = new OrderRow(
                existing.orderId,
                existing.customerId,
                existing.sku,
                existing.quantity,
                existing.unitPrice,
                existing.status,
                existing.rowVersion + 1,
                true);
        sourceOrders.put(normalizedOrderId, deleted);
        appendChange(ChangeOperation.DELETE, deleted, false, "table-delete");
        addEvent("Deleted " + normalizedOrderId + " in the source table.");
        return new CommandResult("Deleted " + normalizedOrderId + ".", toSnapshot());
    }

    public synchronized PollResult poll(PollRequest request) {
        if (paused) {
            addEvent("CDC connector poll skipped because connector is paused.");
            return new PollResult(0, 0, committedOffset, toSnapshot());
        }
        int maxEvents = normalizeBatchSize(request == null ? null : request.maxEvents());
        int applied = 0;
        int duplicates = 0;
        for (ChangeEvent event : changeLog) {
            if (event.sequence <= committedOffset) {
                continue;
            }
            if (applied + duplicates >= maxEvents) {
                break;
            }
            ApplyOutcome outcome = applyEvent(event);
            committedOffset = Math.max(committedOffset, event.sequence);
            if (outcome.duplicate) {
                duplicates += 1;
            } else {
                applied += 1;
            }
        }
        addEvent("Polled CDC log: applied=" + applied + ", duplicates=" + duplicates + ", offset=" + committedOffset + ".");
        return new PollResult(applied, duplicates, committedOffset, toSnapshot());
    }

    public synchronized CommandResult setPaused(boolean nextPaused) {
        paused = nextPaused;
        addEvent("CDC connector " + (paused ? "paused" : "resumed") + ".");
        return new CommandResult("Connector " + (paused ? "paused" : "resumed") + ".", toSnapshot());
    }

    public synchronized CommandResult duplicateEvent(DuplicateEventRequest request) {
        long sequence = request.sequence() == null ? latestSequence() : request.sequence();
        ChangeEvent original = changeLog.stream()
                .filter(event -> event.sequence == sequence)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unknown change sequence: " + sequence));
        changeLog.add(original.copyAsDuplicate(++changeSequence));
        addEvent("Injected duplicate delivery for original sequence " + sequence + " as sequence " + changeSequence + ".");
        return new CommandResult("Injected duplicate event.", toSnapshot());
    }

    public synchronized CommandResult replay(ReplayRequest request) {
        long fromOffset = request.fromOffset() == null ? 0 : Math.max(0, request.fromOffset());
        boolean clear = Boolean.TRUE.equals(request.clearProjections());
        if (clear) {
            clearProjections();
        }
        committedOffset = fromOffset;
        addEvent("Reset connector offset to " + fromOffset + (clear ? " and cleared projections." : "."));
        return new CommandResult("Replay configured from offset " + fromOffset + ".", toSnapshot());
    }

    public synchronized CommandResult backfill() {
        int emitted = 0;
        for (OrderRow row : sourceOrders.values()) {
            appendChange(ChangeOperation.SNAPSHOT, row, false, "backfill");
            emitted += 1;
        }
        addEvent("Backfill emitted " + emitted + " snapshot events.");
        return new CommandResult("Backfill emitted " + emitted + " events.", toSnapshot());
    }

    private ApplyOutcome applyEvent(ChangeEvent event) {
        if (appliedSequences.contains(event.dedupeSequence)) {
            duplicateEvents += 1;
            return new ApplyOutcome(true);
        }
        appliedSequences.add(event.dedupeSequence);
        processedEvents += 1;

        if (event.operation == ChangeOperation.DELETE || event.deleted) {
            orderSummaryProjection.remove(event.orderId);
            searchIndexProjection.remove(event.orderId);
            return new ApplyOutcome(false);
        }

        orderSummaryProjection.put(
                event.orderId,
                new OrderProjection(event.orderId, event.customerId, event.total(), event.status, event.sequence));
        searchIndexProjection.put(
                event.orderId,
                new SearchDocument(event.orderId, event.customerId + " " + event.sku + " " + event.status + " total:" + event.total(), event.sequence));
        return new ApplyOutcome(false);
    }

    private void appendChange(ChangeOperation operation, OrderRow row, boolean duplicate, String source) {
        changeLog.add(new ChangeEvent(
                ++changeSequence,
                changeSequence,
                operation,
                row.orderId,
                row.customerId,
                row.sku,
                row.quantity,
                row.unitPrice,
                row.status,
                row.rowVersion,
                row.deleted,
                duplicate,
                source));
    }

    private SystemSnapshot toSnapshot() {
        return new SystemSnapshot(
                new ConnectorView(paused, committedOffset, latestSequence(), Math.max(0, latestSequence() - committedOffset), processedEvents, duplicateEvents),
                (int) sourceOrders.values().stream().filter(order -> !order.deleted).count(),
                changeLog.size(),
                sourceOrders.values().stream()
                        .sorted(Comparator.comparing(order -> order.orderId))
                        .map(this::toOrderView)
                        .toList(),
                changeLog.stream()
                        .sorted(Comparator.comparingLong((ChangeEvent event) -> event.sequence).reversed())
                        .limit(24)
                        .map(this::toChangeEventView)
                        .toList(),
                toProjectionView(),
                List.copyOf(recentEvents));
    }

    private ProjectionView toProjectionView() {
        Map<String, CustomerAggregate> totals = new TreeMap<>();
        for (OrderProjection projection : orderSummaryProjection.values()) {
            CustomerAggregate aggregate = totals.computeIfAbsent(projection.customerId, key -> new CustomerAggregate());
            aggregate.orderCount += 1;
            aggregate.activeTotal = aggregate.activeTotal.add(projection.total);
        }
        return new ProjectionView(
                orderSummaryProjection.values().stream()
                        .sorted(Comparator.comparing(projection -> projection.orderId))
                        .map(projection -> new OrderSummaryView(projection.orderId, projection.customerId, projection.total, projection.status, projection.sourceSequence))
                        .toList(),
                totals.entrySet().stream()
                        .map(entry -> new CustomerTotalView(entry.getKey(), entry.getValue().orderCount, money(entry.getValue().activeTotal)))
                        .toList(),
                searchIndexProjection.values().stream()
                        .sorted(Comparator.comparing(document -> document.orderId))
                        .map(document -> new SearchIndexView(document.orderId, document.document, document.sourceSequence))
                        .toList());
    }

    private OrderView toOrderView(OrderRow row) {
        return new OrderView(row.orderId, row.customerId, row.sku, row.quantity, row.unitPrice, row.total(), row.status, row.rowVersion, row.deleted);
    }

    private ChangeEventView toChangeEventView(ChangeEvent event) {
        return new ChangeEventView(
                event.sequence,
                event.operation,
                event.orderId,
                event.customerId,
                event.sku,
                event.quantity,
                event.total(),
                event.status,
                event.rowVersion,
                event.duplicate,
                event.source);
    }

    private void clearProjections() {
        orderSummaryProjection.clear();
        searchIndexProjection.clear();
        appliedSequences.clear();
        processedEvents = 0;
        duplicateEvents = 0;
    }

    private OrderRow requireOrder(String orderId) {
        OrderRow row = sourceOrders.get(orderId);
        if (row == null) {
            throw new IllegalArgumentException("Unknown order: " + orderId);
        }
        return row;
    }

    private long latestSequence() {
        return changeLog.isEmpty() ? 0 : changeLog.get(changeLog.size() - 1).sequence;
    }

    private int normalizeBatchSize(Integer maxEvents) {
        int batch = maxEvents == null ? defaultBatchSize : maxEvents;
        if (batch < 1 || batch > 100) {
            throw new IllegalArgumentException("maxEvents must be between 1 and 100.");
        }
        return batch;
    }

    private int normalizeQuantity(Integer quantity) {
        int resolved = quantity == null ? 1 : quantity;
        if (resolved < 1 || resolved > 1000) {
            throw new IllegalArgumentException("quantity must be between 1 and 1000.");
        }
        return resolved;
    }

    private BigDecimal normalizeMoney(BigDecimal value, String fieldName) {
        if (value == null || value.compareTo(BigDecimal.ZERO) <= 0 || value.compareTo(new BigDecimal("1000000")) > 0) {
            throw new IllegalArgumentException(fieldName + " must be greater than 0 and at most 1000000.");
        }
        return money(value);
    }

    private static BigDecimal money(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP);
    }

    private static String normalizeId(String value, String fieldName, int maxLength) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(fieldName + " is required.");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength || !ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException(fieldName + " must use letters, numbers, dot, underscore, colon, or dash.");
        }
        return normalized;
    }

    private void addEvent(String message) {
        recentEvents.addFirst(message);
        while (recentEvents.size() > historyLimit) {
            recentEvents.removeLast();
        }
    }

    private void seed() {
        createOrder(new CreateOrderRequest("customer-1", "sku-keyboard", 1, new BigDecimal("119.00")));
        createOrder(new CreateOrderRequest("customer-1", "sku-mouse", 2, new BigDecimal("39.50")));
        createOrder(new CreateOrderRequest("customer-2", "sku-monitor", 1, new BigDecimal("299.99")));
    }

    private record ApplyOutcome(boolean duplicate) {
    }

    private static final class CustomerAggregate {
        private int orderCount;
        private BigDecimal activeTotal = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
    }

    private static final class OrderRow {
        private final String orderId;
        private final String customerId;
        private final String sku;
        private final int quantity;
        private final BigDecimal unitPrice;
        private final OrderStatus status;
        private final long rowVersion;
        private final boolean deleted;

        private OrderRow(String orderId, String customerId, String sku, int quantity, BigDecimal unitPrice, OrderStatus status, long rowVersion, boolean deleted) {
            this.orderId = orderId;
            this.customerId = customerId;
            this.sku = sku;
            this.quantity = quantity;
            this.unitPrice = money(unitPrice);
            this.status = status;
            this.rowVersion = rowVersion;
            this.deleted = deleted;
        }

        private BigDecimal total() {
            return money(unitPrice.multiply(BigDecimal.valueOf(quantity)));
        }
    }

    private static final class ChangeEvent {
        private final long sequence;
        private final long dedupeSequence;
        private final ChangeOperation operation;
        private final String orderId;
        private final String customerId;
        private final String sku;
        private final int quantity;
        private final BigDecimal unitPrice;
        private final OrderStatus status;
        private final long rowVersion;
        private final boolean deleted;
        private final boolean duplicate;
        private final String source;

        private ChangeEvent(
                long sequence,
                long dedupeSequence,
                ChangeOperation operation,
                String orderId,
                String customerId,
                String sku,
                int quantity,
                BigDecimal unitPrice,
                OrderStatus status,
                long rowVersion,
                boolean deleted,
                boolean duplicate,
                String source) {
            this.sequence = sequence;
            this.dedupeSequence = dedupeSequence;
            this.operation = operation;
            this.orderId = orderId;
            this.customerId = customerId;
            this.sku = sku;
            this.quantity = quantity;
            this.unitPrice = money(unitPrice);
            this.status = status;
            this.rowVersion = rowVersion;
            this.deleted = deleted;
            this.duplicate = duplicate;
            this.source = source;
        }

        private BigDecimal total() {
            return money(unitPrice.multiply(BigDecimal.valueOf(quantity)));
        }

        private ChangeEvent copyAsDuplicate(long nextSequence) {
            return new ChangeEvent(
                    nextSequence,
                    dedupeSequence,
                    operation,
                    orderId,
                    customerId,
                    sku,
                    quantity,
                    unitPrice,
                    status,
                    rowVersion,
                    deleted,
                    true,
                    "duplicate-delivery");
        }
    }

    private static final class OrderProjection {
        private final String orderId;
        private final String customerId;
        private final BigDecimal total;
        private final OrderStatus status;
        private final long sourceSequence;

        private OrderProjection(String orderId, String customerId, BigDecimal total, OrderStatus status, long sourceSequence) {
            this.orderId = orderId;
            this.customerId = customerId;
            this.total = money(total);
            this.status = status;
            this.sourceSequence = sourceSequence;
        }
    }

    private static final class SearchDocument {
        private final String orderId;
        private final String document;
        private final long sourceSequence;

        private SearchDocument(String orderId, String document, long sourceSequence) {
            this.orderId = orderId;
            this.document = document;
            this.sourceSequence = sourceSequence;
        }
    }
}
