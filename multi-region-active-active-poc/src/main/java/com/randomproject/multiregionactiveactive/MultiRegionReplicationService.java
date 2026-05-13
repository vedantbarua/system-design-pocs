package com.randomproject.multiregionactiveactive;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

@Service
public class MultiRegionReplicationService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private static final int DEFAULT_MAX_DRAIN = 20;

    private final Map<String, RegionState> regions = new LinkedHashMap<>();
    private final Deque<ReplicationEvent> pendingEvents = new ArrayDeque<>();
    private final Deque<String> recentEvents = new ArrayDeque<>();
    private final Map<String, ConflictRecord> conflicts = new LinkedHashMap<>();
    private final int historyLimit;
    private final LongSupplier timeSource;
    private long eventSequence;
    private long versionSequence;
    private ConflictStrategy defaultStrategy = ConflictStrategy.VECTOR_CLOCK;

    @Autowired
    public MultiRegionReplicationService(
            @Value("${regions.initial:us-east,us-west,eu-central}") String initialRegions,
            @Value("${replication.history-limit:24}") int historyLimit) {
        this(parseRegions(initialRegions), historyLimit, System::currentTimeMillis);
    }

    MultiRegionReplicationService(List<String> initialRegions, int historyLimit, LongSupplier timeSource) {
        if (initialRegions == null || initialRegions.size() < 2) {
            throw new IllegalArgumentException("At least two regions are required.");
        }
        this.historyLimit = Math.max(6, historyLimit);
        this.timeSource = timeSource;
        for (String regionId : initialRegions) {
            String normalized = normalizeId(regionId, "regionId", 32);
            regions.put(normalized, new RegionState(normalized));
        }
        addEvent("Booted active-active topology with regions " + String.join(", ", regions.keySet()) + ".");
    }

    public synchronized SystemSnapshot snapshot() {
        return toSnapshot();
    }

    public synchronized CommandResult mutateCart(CartMutationRequest request) {
        String regionId = normalizeId(request.regionId(), "regionId", 32);
        String cartId = normalizeId(request.cartId(), "cartId", 80);
        String sku = normalizeId(request.sku(), "sku", 64);
        int delta = normalizeDelta(request.quantityDelta());
        ConflictStrategy strategy = resolveStrategy(request.strategy());
        defaultStrategy = strategy;

        RegionState region = requireRegion(regionId);
        requireActive(region);

        CartState cart = region.carts.computeIfAbsent(cartId, CartState::new);
        int nextQuantity = Math.max(0, cart.items.getOrDefault(sku, 0) + delta);
        if (nextQuantity == 0) {
            cart.items.remove(sku);
        } else {
            cart.items.put(sku, nextQuantity);
        }
        region.localClock += 1;
        cart.vectorClock.put(regionId, region.localClock);
        cart.version = nextVersion();
        cart.updatedAt = timeSource.getAsLong();
        cart.lastWriterRegion = regionId;
        conflicts.remove(conflictKey(regionId, cartId));

        int enqueued = 0;
        for (String targetRegionId : regions.keySet()) {
            if (!targetRegionId.equals(regionId)) {
                pendingEvents.addLast(ReplicationEvent.fromCart(nextEventId(), regionId, targetRegionId, cart));
                enqueued += 1;
            }
        }

        addEvent("Local write in " + regionId + " changed " + cartId + " and queued " + enqueued + " replication events.");
        return new CommandResult("Write accepted in " + regionId + ".", toSnapshot());
    }

    public synchronized CommandResult setRegionActive(RegionModeRequest request) {
        String regionId = normalizeId(request.regionId(), "regionId", 32);
        RegionState region = requireRegion(regionId);
        boolean active = Boolean.TRUE.equals(request.active());
        region.active = active;
        addEvent("Region " + regionId + " marked " + (active ? "active" : "down") + ".");
        return new CommandResult("Region " + regionId + " is now " + (active ? "active" : "down") + ".", toSnapshot());
    }

    public synchronized DrainResult drainReplication(DrainReplicationRequest request) {
        String requestedTarget = normalizeOptionalId(request.targetRegionId(), "targetRegionId", 32);
        int maxEvents = normalizeMaxEvents(request.maxEvents());
        ConflictStrategy strategy = resolveStrategy(request.strategy());
        defaultStrategy = strategy;

        int applied = 0;
        int skipped = 0;
        int processed = 0;
        int originalSize = pendingEvents.size();
        for (int i = 0; i < originalSize && processed < maxEvents; i++) {
            ReplicationEvent event = pendingEvents.removeFirst();
            if (requestedTarget != null && !requestedTarget.equals(event.targetRegionId)) {
                pendingEvents.addLast(event);
                continue;
            }

            RegionState target = regions.get(event.targetRegionId);
            if (target == null || !target.active) {
                pendingEvents.addLast(event);
                skipped += 1;
                continue;
            }

            processed += 1;
            ApplyOutcome outcome = applyIncoming(target, event, strategy);
            event.status = outcome.status;
            event.reason = outcome.reason;
            if (outcome.status == ReplicationStatus.APPLIED) {
                applied += 1;
            }
        }

        addEvent("Drained replication with " + strategy + ": applied=" + applied + ", skipped=" + skipped + ".");
        return new DrainResult(applied, skipped, toSnapshot());
    }

    public synchronized CommandResult dropReplication(DropReplicationRequest request) {
        String sourceRegionId = normalizeOptionalId(request.sourceRegionId(), "sourceRegionId", 32);
        String targetRegionId = normalizeOptionalId(request.targetRegionId(), "targetRegionId", 32);
        String cartId = normalizeOptionalId(request.cartId(), "cartId", 80);
        int dropped = 0;

        int originalSize = pendingEvents.size();
        for (int i = 0; i < originalSize; i++) {
            ReplicationEvent event = pendingEvents.removeFirst();
            boolean matches = (sourceRegionId == null || sourceRegionId.equals(event.sourceRegionId))
                    && (targetRegionId == null || targetRegionId.equals(event.targetRegionId))
                    && (cartId == null || cartId.equals(event.cartId));
            if (matches) {
                dropped += 1;
            } else {
                pendingEvents.addLast(event);
            }
        }

        addEvent("Dropped " + dropped + " queued replication events.");
        return new CommandResult("Dropped " + dropped + " replication events.", toSnapshot());
    }

    public synchronized CommandResult reconcileConflict(ReconcileRequest request) {
        String regionId = normalizeId(request.regionId(), "regionId", 32);
        String cartId = normalizeId(request.cartId(), "cartId", 80);
        ConflictStrategy strategy = resolveStrategy(request.strategy());
        ConflictRecord conflict = conflicts.remove(conflictKey(regionId, cartId));
        if (conflict == null) {
            return new CommandResult("No unresolved conflict exists for " + cartId + " in " + regionId + ".", toSnapshot());
        }
        RegionState region = requireRegion(regionId);
        CartState local = region.carts.get(cartId);
        if (local == null || strategy == ConflictStrategy.LAST_WRITE_WINS && conflict.incoming.version >= local.version) {
            region.carts.put(cartId, conflict.incoming.copy());
        } else if (strategy == ConflictStrategy.CART_MERGE) {
            region.carts.put(cartId, mergeCarts(local, conflict.incoming, regionId));
        }
        addEvent("Resolved conflict for " + cartId + " in " + regionId + " using " + strategy + ".");
        return new CommandResult("Resolved conflict for " + cartId + ".", toSnapshot());
    }

    private ApplyOutcome applyIncoming(RegionState target, ReplicationEvent event, ConflictStrategy strategy) {
        CartState incoming = event.toCart();
        CartState local = target.carts.get(event.cartId);
        if (local == null) {
            target.carts.put(event.cartId, incoming);
            conflicts.remove(conflictKey(target.regionId, event.cartId));
            addEvent("Applied remote cart " + event.cartId + " from " + event.sourceRegionId + " into " + target.regionId + ".");
            return new ApplyOutcome(ReplicationStatus.APPLIED, "created target copy");
        }

        int vectorComparison = compareVectorClocks(local.vectorClock, incoming.vectorClock);
        if (vectorComparison == -1) {
            target.carts.put(event.cartId, incoming);
            conflicts.remove(conflictKey(target.regionId, event.cartId));
            addEvent("Updated " + event.cartId + " in " + target.regionId + " from dominating remote version.");
            return new ApplyOutcome(ReplicationStatus.APPLIED, "incoming vector dominated local vector");
        }
        if (vectorComparison == 1) {
            return new ApplyOutcome(ReplicationStatus.SKIPPED, "local vector already includes incoming write");
        }
        if (vectorComparison == 0) {
            return new ApplyOutcome(ReplicationStatus.SKIPPED, "same vector clock already present");
        }

        if (strategy == ConflictStrategy.LAST_WRITE_WINS) {
            if (incoming.version >= local.version) {
                target.carts.put(event.cartId, incoming);
                conflicts.remove(conflictKey(target.regionId, event.cartId));
                addEvent("Last-write-wins replaced " + event.cartId + " in " + target.regionId + ".");
                return new ApplyOutcome(ReplicationStatus.APPLIED, "incoming version was newer");
            }
            return new ApplyOutcome(ReplicationStatus.SKIPPED, "local version was newer");
        }

        if (strategy == ConflictStrategy.CART_MERGE) {
            target.carts.put(event.cartId, mergeCarts(local, incoming, target.regionId));
            conflicts.remove(conflictKey(target.regionId, event.cartId));
            addEvent("Merged concurrent cart versions for " + event.cartId + " in " + target.regionId + ".");
            return new ApplyOutcome(ReplicationStatus.APPLIED, "concurrent carts merged by SKU");
        }

        conflicts.put(conflictKey(target.regionId, event.cartId), new ConflictRecord(target.regionId, local.copy(), incoming.copy(), timeSource.getAsLong()));
        addEvent("Detected vector-clock conflict for " + event.cartId + " in " + target.regionId + ".");
        return new ApplyOutcome(ReplicationStatus.CONFLICT, "concurrent vector clocks require reconciliation");
    }

    private CartState mergeCarts(CartState local, CartState incoming, String mergeRegionId) {
        CartState merged = local.copy();
        for (Map.Entry<String, Integer> entry : incoming.items.entrySet()) {
            merged.items.merge(entry.getKey(), entry.getValue(), Math::max);
        }
        for (Map.Entry<String, Long> entry : incoming.vectorClock.entrySet()) {
            merged.vectorClock.merge(entry.getKey(), entry.getValue(), Math::max);
        }
        merged.version = nextVersion();
        merged.updatedAt = timeSource.getAsLong();
        merged.lastWriterRegion = mergeRegionId + "-merge";
        return merged;
    }

    private SystemSnapshot toSnapshot() {
        List<RegionView> regionViews = regions.values().stream()
                .map(this::toRegionView)
                .toList();
        List<ReplicationEventView> eventViews = pendingEvents.stream()
                .sorted(Comparator.comparingLong(event -> event.eventId))
                .map(this::toEventView)
                .toList();
        List<ConflictView> conflictViews = conflicts.values().stream()
                .sorted(Comparator.comparing(ConflictRecord::regionId).thenComparing(conflict -> conflict.local.cartId))
                .map(this::toConflictView)
                .toList();
        int activeRegions = (int) regions.values().stream().filter(region -> region.active).count();
        return new SystemSnapshot(
                defaultStrategy,
                regions.size(),
                activeRegions,
                pendingEvents.size(),
                conflicts.size(),
                regionViews,
                eventViews,
                conflictViews,
                List.copyOf(recentEvents));
    }

    private RegionView toRegionView(RegionState region) {
        List<CartView> carts = region.carts.values().stream()
                .sorted(Comparator.comparing(cart -> cart.cartId))
                .map(cart -> toCartView(region.regionId, cart))
                .toList();
        return new RegionView(region.regionId, region.active, region.localClock, carts.size(), carts);
    }

    private CartView toCartView(String regionId, CartState cart) {
        return new CartView(
                cart.cartId,
                itemViews(cart.items),
                new TreeMap<>(cart.vectorClock),
                cart.version,
                cart.lastWriterRegion,
                cart.updatedAt,
                conflicts.containsKey(conflictKey(regionId, cart.cartId)));
    }

    private ReplicationEventView toEventView(ReplicationEvent event) {
        return new ReplicationEventView(
                event.eventId,
                event.sourceRegionId,
                event.targetRegionId,
                event.cartId,
                event.version,
                new TreeMap<>(event.vectorClock),
                event.status,
                event.reason);
    }

    private ConflictView toConflictView(ConflictRecord conflict) {
        return new ConflictView(
                conflict.regionId,
                conflict.local.cartId,
                conflict.local.version,
                conflict.incoming.version,
                new TreeMap<>(conflict.local.vectorClock),
                new TreeMap<>(conflict.incoming.vectorClock),
                itemViews(conflict.local.items),
                itemViews(conflict.incoming.items),
                conflict.detectedAt);
    }

    private List<CartItemView> itemViews(Map<String, Integer> items) {
        return items.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> new CartItemView(entry.getKey(), entry.getValue()))
                .toList();
    }

    private int compareVectorClocks(Map<String, Long> local, Map<String, Long> incoming) {
        Set<String> keys = new TreeSet<>();
        keys.addAll(local.keySet());
        keys.addAll(incoming.keySet());
        boolean localGreater = false;
        boolean incomingGreater = false;
        for (String key : keys) {
            long left = local.getOrDefault(key, 0L);
            long right = incoming.getOrDefault(key, 0L);
            if (left > right) {
                localGreater = true;
            } else if (right > left) {
                incomingGreater = true;
            }
        }
        if (localGreater && incomingGreater) {
            return 2;
        }
        if (localGreater) {
            return 1;
        }
        if (incomingGreater) {
            return -1;
        }
        return 0;
    }

    private RegionState requireRegion(String regionId) {
        RegionState region = regions.get(regionId);
        if (region == null) {
            throw new IllegalArgumentException("Unknown region: " + regionId);
        }
        return region;
    }

    private void requireActive(RegionState region) {
        if (!region.active) {
            throw new IllegalArgumentException("Region " + region.regionId + " is down.");
        }
    }

    private ConflictStrategy resolveStrategy(ConflictStrategy strategy) {
        return strategy == null ? defaultStrategy : strategy;
    }

    private int normalizeDelta(Integer quantityDelta) {
        int delta = quantityDelta == null ? 1 : quantityDelta;
        if (delta < -50 || delta > 50 || delta == 0) {
            throw new IllegalArgumentException("quantityDelta must be between -50 and 50 and cannot be zero.");
        }
        return delta;
    }

    private int normalizeMaxEvents(Integer maxEvents) {
        int max = maxEvents == null ? DEFAULT_MAX_DRAIN : maxEvents;
        if (max < 1 || max > 100) {
            throw new IllegalArgumentException("maxEvents must be between 1 and 100.");
        }
        return max;
    }

    private static List<String> parseRegions(String initialRegions) {
        return List.of(initialRegions.split(",")).stream()
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .toList();
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

    private static String normalizeOptionalId(String value, String fieldName, int maxLength) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return normalizeId(value, fieldName, maxLength);
    }

    private long nextEventId() {
        eventSequence += 1;
        return eventSequence;
    }

    private long nextVersion() {
        versionSequence += 1;
        return versionSequence;
    }

    private String conflictKey(String regionId, String cartId) {
        return regionId + "::" + cartId;
    }

    private void addEvent(String message) {
        recentEvents.addFirst(message);
        while (recentEvents.size() > historyLimit) {
            recentEvents.removeLast();
        }
    }

    private record ApplyOutcome(ReplicationStatus status, String reason) {
    }

    private record ConflictRecord(String regionId, CartState local, CartState incoming, long detectedAt) {
    }

    private static final class RegionState {
        private final String regionId;
        private final Map<String, CartState> carts = new LinkedHashMap<>();
        private boolean active = true;
        private long localClock;

        private RegionState(String regionId) {
            this.regionId = regionId;
        }
    }

    private static final class CartState {
        private final String cartId;
        private final Map<String, Integer> items = new LinkedHashMap<>();
        private final Map<String, Long> vectorClock = new LinkedHashMap<>();
        private long version;
        private String lastWriterRegion;
        private long updatedAt;

        private CartState(String cartId) {
            this.cartId = cartId;
        }

        private CartState copy() {
            CartState copy = new CartState(cartId);
            copy.items.putAll(items);
            copy.vectorClock.putAll(vectorClock);
            copy.version = version;
            copy.lastWriterRegion = lastWriterRegion;
            copy.updatedAt = updatedAt;
            return copy;
        }
    }

    private static final class ReplicationEvent {
        private final long eventId;
        private final String sourceRegionId;
        private final String targetRegionId;
        private final String cartId;
        private final Map<String, Integer> items;
        private final Map<String, Long> vectorClock;
        private final long version;
        private final String lastWriterRegion;
        private final long updatedAt;
        private ReplicationStatus status = ReplicationStatus.PENDING;
        private String reason = "queued";

        private ReplicationEvent(
                long eventId,
                String sourceRegionId,
                String targetRegionId,
                String cartId,
                Map<String, Integer> items,
                Map<String, Long> vectorClock,
                long version,
                String lastWriterRegion,
                long updatedAt) {
            this.eventId = eventId;
            this.sourceRegionId = sourceRegionId;
            this.targetRegionId = targetRegionId;
            this.cartId = cartId;
            this.items = items;
            this.vectorClock = vectorClock;
            this.version = version;
            this.lastWriterRegion = lastWriterRegion;
            this.updatedAt = updatedAt;
        }

        private static ReplicationEvent fromCart(long eventId, String sourceRegionId, String targetRegionId, CartState cart) {
            return new ReplicationEvent(
                    eventId,
                    sourceRegionId,
                    targetRegionId,
                    cart.cartId,
                    new LinkedHashMap<>(cart.items),
                    new LinkedHashMap<>(cart.vectorClock),
                    cart.version,
                    cart.lastWriterRegion,
                    cart.updatedAt);
        }

        private CartState toCart() {
            CartState cart = new CartState(cartId);
            cart.items.putAll(items);
            cart.vectorClock.putAll(vectorClock);
            cart.version = version;
            cart.lastWriterRegion = lastWriterRegion;
            cart.updatedAt = updatedAt;
            return cart;
        }
    }
}
