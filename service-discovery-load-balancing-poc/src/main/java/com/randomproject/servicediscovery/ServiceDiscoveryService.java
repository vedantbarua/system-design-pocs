package com.randomproject.servicediscovery;

import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.LongSupplier;
import java.util.zip.CRC32;

@Service
public class ServiceDiscoveryService {
    private static final int MAX_EVENTS = 60;
    private static final int MAX_ROUTES = 40;
    private static final int DEFAULT_WEIGHT = 100;
    private static final long DEFAULT_LEASE_MILLIS = 15_000L;
    private static final long DEFAULT_EJECTION_MILLIS = 10_000L;
    private static final int FAILURE_THRESHOLD = 2;

    private final Map<String, InstanceState> instancesById = new LinkedHashMap<>();
    private final Map<String, AtomicLong> serviceCursors = new LinkedHashMap<>();
    private final Deque<RegistryEventState> recentEvents = new ArrayDeque<>();
    private final Deque<RoutingDecision> recentRoutes = new ArrayDeque<>();
    private final LongSupplier timeSource;
    private final long leaseDurationMillis;
    private final long ejectionDurationMillis;

    public ServiceDiscoveryService() {
        this(System::currentTimeMillis, DEFAULT_LEASE_MILLIS, DEFAULT_EJECTION_MILLIS);
    }

    ServiceDiscoveryService(LongSupplier timeSource, long leaseDurationMillis, long ejectionDurationMillis) {
        this.timeSource = timeSource;
        this.leaseDurationMillis = leaseDurationMillis;
        this.ejectionDurationMillis = ejectionDurationMillis;
    }

    public synchronized DiscoverySnapshot snapshot() {
        long now = now();
        List<ServiceView> services = instancesById.values().stream()
                .collect(java.util.stream.Collectors.groupingBy(
                        instance -> instance.service,
                        LinkedHashMap::new,
                        java.util.stream.Collectors.toList()))
                .entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> toServiceView(entry.getKey(), entry.getValue(), now))
                .toList();

        int instanceCount = instancesById.size();
        int routableCount = (int) instancesById.values().stream().filter(instance -> isRoutable(instance, now)).count();
        int canaryCount = (int) instancesById.values().stream().filter(instance -> instance.canary).count();

        return new DiscoverySnapshot(
                services.size(),
                instanceCount,
                routableCount,
                canaryCount,
                leaseDurationMillis,
                ejectionDurationMillis,
                services,
                List.copyOf(recentRoutes),
                recentEvents.stream().map(this::toEventView).toList());
    }

    public synchronized InstanceView register(RegisterInstanceRequest request) {
        long now = now();
        String service = normalizeRequired(request.service(), "service");
        String zone = normalizeRequired(request.zone(), "zone");
        String version = normalizeRequired(request.version(), "version");
        String instanceId = Optional.ofNullable(normalizeText(request.instanceId()))
                .filter(id -> !id.isBlank())
                .orElse(service + "-" + zone + "-" + (instancesById.size() + 1));
        if (instancesById.containsKey(instanceId)) {
            throw new IllegalArgumentException("Instance " + instanceId + " already exists.");
        }

        InstanceState instance = new InstanceState(
                service,
                instanceId,
                zone,
                version,
                normalizeWeight(request.weight()),
                Boolean.TRUE.equals(request.canary()),
                InstanceLifecycle.UP,
                now,
                0L,
                0,
                normalizeMetadata(request.metadata()));
        instancesById.put(instanceId, instance);
        addEvent("REGISTER", service, instanceId, "Registered " + service + " instance in zone " + zone + ".");
        return toInstanceView(instance, now);
    }

    public synchronized HeartbeatResult heartbeat(String rawInstanceId) {
        InstanceState instance = requireInstance(rawInstanceId);
        long now = now();
        instance.lastHeartbeatAtMillis = now;
        addEvent("HEARTBEAT", instance.service, instance.instanceId, "Lease renewed.");
        return new HeartbeatResult(instance.instanceId, Instant.ofEpochMilli(now), now + leaseDurationMillis);
    }

    public synchronized InstanceActionResult updateStatus(String rawInstanceId, StatusUpdateRequest request) {
        InstanceState instance = requireInstance(rawInstanceId);
        long now = now();
        instance.lifecycle = request.status();
        if (request.status() == InstanceLifecycle.DOWN) {
            instance.ejectedUntilMillis = 0L;
        }
        addEvent("STATUS", instance.service, instance.instanceId, "Lifecycle set to " + request.status().name() + ".");
        return new InstanceActionResult(
                instance.instanceId,
                instance.service,
                effectiveState(instance, now),
                Instant.ofEpochMilli(now),
                "Updated lifecycle to " + request.status().name() + ".");
    }

    public synchronized InstanceActionResult recordResult(String rawInstanceId, InstanceResultRequest request) {
        InstanceState instance = requireInstance(rawInstanceId);
        long now = now();
        if (Boolean.TRUE.equals(request.success())) {
            instance.consecutiveFailures = 0;
            if (instance.ejectedUntilMillis > 0L && instance.ejectedUntilMillis <= now) {
                instance.ejectedUntilMillis = 0L;
            }
            addEvent("RESULT", instance.service, instance.instanceId, "Recorded success.");
            return new InstanceActionResult(
                    instance.instanceId,
                    instance.service,
                    effectiveState(instance, now),
                    Instant.ofEpochMilli(now),
                    "Recorded successful response.");
        }

        instance.consecutiveFailures += 1;
        String message = "Recorded failure.";
        if (instance.consecutiveFailures >= FAILURE_THRESHOLD) {
            instance.ejectedUntilMillis = now + ejectionDurationMillis;
            instance.consecutiveFailures = 0;
            message = "Failure threshold reached. Instance temporarily ejected.";
            addEvent("EJECT", instance.service, instance.instanceId, message);
        } else {
            addEvent("RESULT", instance.service, instance.instanceId, "Recorded failure.");
        }
        return new InstanceActionResult(
                instance.instanceId,
                instance.service,
                effectiveState(instance, now),
                Instant.ofEpochMilli(now),
                message);
    }

    public synchronized RoutingDecision route(RoutingRequest request) {
        String service = normalizeRequired(request.service(), "service");
        long now = now();
        List<InstanceState> serviceInstances = instancesById.values().stream()
                .filter(instance -> instance.service.equals(service))
                .toList();
        if (serviceInstances.isEmpty()) {
            throw new IllegalArgumentException("Service " + service + " has no registered instances.");
        }

        boolean allowCanary = !Boolean.FALSE.equals(request.allowCanary());
        List<InstanceState> eligible = serviceInstances.stream()
                .filter(instance -> isRoutable(instance, now))
                .filter(instance -> allowCanary || !instance.canary)
                .sorted(Comparator.comparing(instance -> instance.instanceId))
                .toList();
        if (eligible.isEmpty()) {
            throw new IllegalStateException("Service " + service + " has no routable instances.");
        }

        String requestedZone = normalizeText(request.clientZone());
        List<InstanceState> zoned = requestedZone == null ? List.of() : eligible.stream()
                .filter(instance -> instance.zone.equals(requestedZone))
                .toList();
        List<InstanceState> pool = zoned.isEmpty() ? eligible : zoned;
        String matchedZone = zoned.isEmpty() ? pool.get(0).zone : requestedZone;

        String sessionKey = normalizeText(request.sessionKey());
        Selection selection = selectInstance(service, pool, sessionKey);
        RoutedInstance routed = new RoutedInstance(
                selection.instance.service,
                selection.instance.instanceId,
                selection.instance.zone,
                selection.instance.version,
                selection.instance.weight,
                selection.instance.canary);
        RoutingDecision decision = new RoutingDecision(
                service,
                selection.strategy,
                requestedZone,
                matchedZone,
                sessionKey,
                allowCanary,
                routed,
                Instant.ofEpochMilli(now),
                zoned.isEmpty() && requestedZone != null
                        ? "No healthy local-zone instance. Fell back to another zone."
                        : "Routed to healthy instance.");
        recentRoutes.addFirst(decision);
        while (recentRoutes.size() > MAX_ROUTES) {
            recentRoutes.removeLast();
        }
        addEvent("ROUTE", service, selection.instance.instanceId, decision.note());
        return decision;
    }

    private Selection selectInstance(String service, List<InstanceState> candidates, String sessionKey) {
        if (sessionKey != null) {
            InstanceState best = null;
            double bestScore = Double.NEGATIVE_INFINITY;
            for (InstanceState candidate : candidates) {
                double score = rendezvousScore(service, sessionKey, candidate);
                if (score > bestScore) {
                    bestScore = score;
                    best = candidate;
                }
            }
            return new Selection(best, "affinity-rendezvous");
        }

        int totalWeight = candidates.stream().mapToInt(instance -> instance.weight).sum();
        AtomicLong cursor = serviceCursors.computeIfAbsent(service, ignored -> new AtomicLong(0L));
        long ticket = Math.floorMod(cursor.getAndIncrement(), totalWeight);
        int running = 0;
        for (InstanceState candidate : candidates) {
            running += candidate.weight;
            if (ticket < running) {
                return new Selection(candidate, "weighted-round-robin");
            }
        }
        return new Selection(candidates.get(0), "weighted-round-robin");
    }

    private double rendezvousScore(String service, String sessionKey, InstanceState candidate) {
        long hash = positiveHash(service + ":" + sessionKey + ":" + candidate.instanceId);
        return (double) hash * candidate.weight;
    }

    private boolean isRoutable(InstanceState instance, long now) {
        if (instance.lifecycle != InstanceLifecycle.UP) {
            return false;
        }
        if (instance.ejectedUntilMillis > now) {
            return false;
        }
        return !isExpired(instance, now);
    }

    private boolean isExpired(InstanceState instance, long now) {
        return instance.lastHeartbeatAtMillis + leaseDurationMillis < now;
    }

    private String effectiveState(InstanceState instance, long now) {
        if (instance.lifecycle == InstanceLifecycle.DOWN) {
            return "DOWN";
        }
        if (isExpired(instance, now)) {
            return "EXPIRED";
        }
        if (instance.ejectedUntilMillis > now) {
            return "EJECTED";
        }
        if (instance.lifecycle == InstanceLifecycle.DRAINING) {
            return "DRAINING";
        }
        return "ROUTABLE";
    }

    private ServiceView toServiceView(String service, List<InstanceState> instances, long now) {
        List<InstanceView> views = instances.stream()
                .sorted(Comparator.comparing(instance -> instance.instanceId))
                .map(instance -> toInstanceView(instance, now))
                .toList();
        int routable = (int) instances.stream().filter(instance -> isRoutable(instance, now)).count();
        int canary = (int) instances.stream().filter(instance -> instance.canary).count();
        return new ServiceView(service, instances.size(), routable, canary, views);
    }

    private InstanceView toInstanceView(InstanceState instance, long now) {
        return new InstanceView(
                instance.service,
                instance.instanceId,
                instance.zone,
                instance.version,
                instance.weight,
                instance.canary,
                instance.lifecycle,
                effectiveState(instance, now),
                instance.consecutiveFailures,
                instance.lastHeartbeatAtMillis + leaseDurationMillis,
                Instant.ofEpochMilli(instance.lastHeartbeatAtMillis),
                instance.ejectedUntilMillis > 0L ? Instant.ofEpochMilli(instance.ejectedUntilMillis) : null,
                instance.metadata);
    }

    private RegistryEventView toEventView(RegistryEventState event) {
        return new RegistryEventView(
                Instant.ofEpochMilli(event.happenedAtMillis),
                event.type,
                event.service,
                event.instanceId,
                event.summary);
    }

    private void addEvent(String type, String service, String instanceId, String summary) {
        recentEvents.addFirst(new RegistryEventState(now(), type, service, instanceId, summary));
        while (recentEvents.size() > MAX_EVENTS) {
            recentEvents.removeLast();
        }
    }

    private InstanceState requireInstance(String rawInstanceId) {
        String instanceId = normalizeRequired(rawInstanceId, "instanceId");
        InstanceState instance = instancesById.get(instanceId);
        if (instance == null) {
            throw new IllegalArgumentException("Instance " + instanceId + " does not exist.");
        }
        return instance;
    }

    private int normalizeWeight(Integer weight) {
        int value = weight == null ? DEFAULT_WEIGHT : weight;
        if (value < 1 || value > 1000) {
            throw new IllegalArgumentException("weight must be between 1 and 1000.");
        }
        return value;
    }

    private Map<String, String> normalizeMetadata(Map<String, String> metadata) {
        if (metadata == null || metadata.isEmpty()) {
            return Map.of();
        }
        Map<String, String> normalized = new LinkedHashMap<>();
        metadata.forEach((key, value) -> {
            String normalizedKey = normalizeText(key);
            String normalizedValue = normalizeText(value);
            if (normalizedKey != null && normalizedValue != null) {
                normalized.put(normalizedKey, normalizedValue);
            }
        });
        return Map.copyOf(normalized);
    }

    private String normalizeRequired(String raw, String field) {
        String value = normalizeText(raw);
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(field + " is required.");
        }
        return value;
    }

    private String normalizeText(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim().toLowerCase();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private long positiveHash(String value) {
        CRC32 crc32 = new CRC32();
        crc32.update(value.getBytes(StandardCharsets.UTF_8));
        return crc32.getValue() & 0x7fffffffL;
    }

    private long now() {
        return timeSource.getAsLong();
    }

    private static final class Selection {
        private final InstanceState instance;
        private final String strategy;

        private Selection(InstanceState instance, String strategy) {
            this.instance = Objects.requireNonNull(instance);
            this.strategy = strategy;
        }
    }

    private static final class InstanceState {
        private final String service;
        private final String instanceId;
        private final String zone;
        private final String version;
        private final int weight;
        private final boolean canary;
        private InstanceLifecycle lifecycle;
        private long lastHeartbeatAtMillis;
        private long ejectedUntilMillis;
        private int consecutiveFailures;
        private final Map<String, String> metadata;

        private InstanceState(String service,
                              String instanceId,
                              String zone,
                              String version,
                              int weight,
                              boolean canary,
                              InstanceLifecycle lifecycle,
                              long lastHeartbeatAtMillis,
                              long ejectedUntilMillis,
                              int consecutiveFailures,
                              Map<String, String> metadata) {
            this.service = service;
            this.instanceId = instanceId;
            this.zone = zone;
            this.version = version;
            this.weight = weight;
            this.canary = canary;
            this.lifecycle = lifecycle;
            this.lastHeartbeatAtMillis = lastHeartbeatAtMillis;
            this.ejectedUntilMillis = ejectedUntilMillis;
            this.consecutiveFailures = consecutiveFailures;
            this.metadata = metadata;
        }
    }

    private record RegistryEventState(
            long happenedAtMillis,
            String type,
            String service,
            String instanceId,
            String summary) {
    }
}
