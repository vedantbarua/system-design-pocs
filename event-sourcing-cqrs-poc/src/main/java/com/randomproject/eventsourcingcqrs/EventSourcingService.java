package com.randomproject.eventsourcingcqrs;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.TreeMap;
import java.util.function.LongSupplier;
import java.util.regex.Pattern;

@Service
public class EventSourcingService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");

    private final Map<String, List<StoredEvent>> eventStore = new LinkedHashMap<>();
    private final Map<String, OrderSnapshotState> snapshots = new LinkedHashMap<>();
    private final Map<String, OrderProjection> projections = new LinkedHashMap<>();
    private final Map<String, CommandOutcomeView> commandDedup = new LinkedHashMap<>();
    private final Deque<CommandOutcomeView> recentCommands = new ArrayDeque<>();

    private final int snapshotFrequency;
    private final int recentEventLimit;
    private final int recentCommandLimit;
    private final LongSupplier timeSource;

    private long nextEventId = 1L;
    private long projectionVersion = 0L;

    @Autowired
    public EventSourcingService(
            @Value("${events.snapshot-frequency:3}") int snapshotFrequency,
            @Value("${events.recent-events-limit:18}") int recentEventLimit,
            @Value("${events.recent-command-limit:12}") int recentCommandLimit) {
        this(snapshotFrequency, recentEventLimit, recentCommandLimit, System::currentTimeMillis);
    }

    EventSourcingService(int snapshotFrequency, int recentEventLimit, int recentCommandLimit, LongSupplier timeSource) {
        if (snapshotFrequency < 1) {
            throw new IllegalArgumentException("snapshot-frequency must be at least 1.");
        }
        this.snapshotFrequency = snapshotFrequency;
        this.recentEventLimit = Math.max(1, recentEventLimit);
        this.recentCommandLimit = Math.max(1, recentCommandLimit);
        this.timeSource = timeSource;
    }

    public synchronized EventConfigView configSnapshot() {
        return new EventConfigView(snapshotFrequency, recentEventLimit, recentCommandLimit);
    }

    public synchronized EventSourcingSnapshotView snapshot() {
        List<OrderSummaryView> orders = projections.values().stream()
                .sorted(Comparator.comparing(OrderProjection::orderId))
                .map(this::toOrderSummary)
                .toList();

        List<StoredEventView> recentEvents = allEvents().stream()
                .sorted(Comparator.comparingLong(StoredEvent::eventId).reversed())
                .limit(recentEventLimit)
                .map(this::toStoredEventView)
                .toList();

        List<SnapshotView> snapshotViews = snapshots.values().stream()
                .sorted(Comparator.comparing(OrderSnapshotState::orderId))
                .map(this::toSnapshotView)
                .toList();

        int draft = 0;
        int confirmed = 0;
        int cancelled = 0;
        int totalQuantity = 0;
        double totalRevenue = 0.0;
        for (OrderProjection projection : projections.values()) {
            switch (projection.status) {
                case DRAFT -> draft++;
                case CONFIRMED -> confirmed++;
                case CANCELLED -> cancelled++;
            }
            totalQuantity += projection.totalQuantity;
            totalRevenue += projection.totalAmount;
        }

        return new EventSourcingSnapshotView(
                configSnapshot(),
                new OrderMetricsView(
                        eventStore.size(),
                        allEvents().size(),
                        snapshots.size(),
                        draft,
                        confirmed,
                        cancelled,
                        totalQuantity,
                        roundMoney(totalRevenue),
                        projectionVersion),
                orders,
                recentEvents,
                snapshotViews,
                List.copyOf(recentCommands));
    }

    public synchronized CommandOutcomeView createOrder(String orderId, String customerId, Long expectedVersion, String commandId) {
        String normalizedOrderId = normalizeId(orderId, "orderId");
        String normalizedCustomerId = normalizeId(customerId, "customerId");
        long version = normalizeExpectedVersion(expectedVersion);
        return dedupeOrRun(commandId, normalizedOrderId, "CreateOrder", () -> {
            if (version != 0L) {
                throw new IllegalArgumentException("CreateOrder expects version 0.");
            }
            if (eventStore.containsKey(normalizedOrderId)) {
                throw new IllegalArgumentException("Order " + normalizedOrderId + " already exists.");
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("customerId", normalizedCustomerId);
            StoredEvent event = appendEvent(normalizedOrderId, 1L, "OrderCreated", data);
            rebuildProjectionFor(normalizedOrderId);
            maybeCreateSnapshot(normalizedOrderId);
            return rememberOutcome(normalizedCommandId(commandId), normalizedOrderId, "CreateOrder", false,
                    event.aggregateVersion, "Created order " + normalizedOrderId + " for customer " + normalizedCustomerId + ".");
        });
    }

    public synchronized CommandOutcomeView addItem(
            String orderId,
            String sku,
            Integer quantity,
            Double unitPrice,
            Long expectedVersion,
            String commandId) {
        String normalizedOrderId = normalizeId(orderId, "orderId");
        String normalizedSku = normalizeId(sku, "sku");
        int normalizedQuantity = requirePositive(quantity, "quantity");
        double normalizedUnitPrice = requirePositiveMoney(unitPrice, "unitPrice");
        long version = normalizeExpectedVersion(expectedVersion);
        return dedupeOrRun(commandId, normalizedOrderId, "AddItem", () -> {
            OrderAggregate aggregate = loadAggregate(normalizedOrderId);
            requireVersion(aggregate.version, version);
            if (aggregate.status != OrderStatus.DRAFT) {
                throw new IllegalArgumentException("Only draft orders can accept new items.");
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("sku", normalizedSku);
            data.put("quantity", normalizedQuantity);
            data.put("unitPrice", normalizedUnitPrice);
            StoredEvent event = appendEvent(normalizedOrderId, aggregate.version + 1, "ItemAdded", data);
            rebuildProjectionFor(normalizedOrderId);
            maybeCreateSnapshot(normalizedOrderId);
            return rememberOutcome(normalizedCommandId(commandId), normalizedOrderId, "AddItem", false,
                    event.aggregateVersion, "Added " + normalizedQuantity + " x " + normalizedSku + " to " + normalizedOrderId + ".");
        });
    }

    public synchronized CommandOutcomeView confirmOrder(String orderId, Long expectedVersion, String commandId) {
        String normalizedOrderId = normalizeId(orderId, "orderId");
        long version = normalizeExpectedVersion(expectedVersion);
        return dedupeOrRun(commandId, normalizedOrderId, "ConfirmOrder", () -> {
            OrderAggregate aggregate = loadAggregate(normalizedOrderId);
            requireVersion(aggregate.version, version);
            if (aggregate.status != OrderStatus.DRAFT) {
                throw new IllegalArgumentException("Only draft orders can be confirmed.");
            }
            if (aggregate.totalQuantity == 0) {
                throw new IllegalArgumentException("Cannot confirm an empty order.");
            }
            StoredEvent event = appendEvent(normalizedOrderId, aggregate.version + 1, "OrderConfirmed", Map.of());
            rebuildProjectionFor(normalizedOrderId);
            maybeCreateSnapshot(normalizedOrderId);
            return rememberOutcome(normalizedCommandId(commandId), normalizedOrderId, "ConfirmOrder", false,
                    event.aggregateVersion, "Confirmed order " + normalizedOrderId + ".");
        });
    }

    public synchronized CommandOutcomeView cancelOrder(String orderId, Long expectedVersion, String reason, String commandId) {
        String normalizedOrderId = normalizeId(orderId, "orderId");
        long version = normalizeExpectedVersion(expectedVersion);
        String normalizedReason = normalizeReason(reason);
        return dedupeOrRun(commandId, normalizedOrderId, "CancelOrder", () -> {
            OrderAggregate aggregate = loadAggregate(normalizedOrderId);
            requireVersion(aggregate.version, version);
            if (aggregate.status == OrderStatus.CANCELLED) {
                throw new IllegalArgumentException("Order " + normalizedOrderId + " is already cancelled.");
            }
            if (aggregate.status == OrderStatus.CONFIRMED) {
                throw new IllegalArgumentException("Confirmed orders cannot be cancelled in this POC.");
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("reason", normalizedReason);
            StoredEvent event = appendEvent(normalizedOrderId, aggregate.version + 1, "OrderCancelled", data);
            rebuildProjectionFor(normalizedOrderId);
            maybeCreateSnapshot(normalizedOrderId);
            return rememberOutcome(normalizedCommandId(commandId), normalizedOrderId, "CancelOrder", false,
                    event.aggregateVersion, "Cancelled order " + normalizedOrderId + ".");
        });
    }

    public synchronized CommandOutcomeView rebuildProjections(String trigger) {
        projections.clear();
        projectionVersion = 0L;
        for (StoredEvent event : allEvents()) {
            applyProjectionEvent(event);
        }
        return rememberOutcome(
                "rebuild-" + now(),
                "projection-store",
                "RebuildProjection",
                false,
                projectionVersion,
                "Rebuilt projections from " + allEvents().size() + " event(s)" +
                        (trigger == null || trigger.isBlank() ? "." : " via " + trigger + "."));
    }

    public synchronized OrderSummaryView findOrder(String orderId) {
        if (orderId == null || orderId.isBlank()) {
            return null;
        }
        OrderProjection projection = projections.get(orderId.trim());
        return projection == null ? null : toOrderSummary(projection);
    }

    public synchronized List<StoredEventView> eventsForOrder(String orderId) {
        if (orderId == null || orderId.isBlank()) {
            return List.of();
        }
        return eventStore.getOrDefault(orderId.trim(), List.of()).stream()
                .map(this::toStoredEventView)
                .toList();
    }

    private CommandOutcomeView dedupeOrRun(String commandId, String aggregateId, String commandType, CommandAction action) {
        String normalizedCommandId = normalizedCommandId(commandId);
        if (normalizedCommandId != null) {
            CommandOutcomeView prior = commandDedup.get(normalizedCommandId);
            if (prior != null) {
                CommandOutcomeView duplicate = new CommandOutcomeView(
                        prior.commandId(),
                        prior.aggregateId(),
                        prior.commandType(),
                        true,
                        prior.resultingVersion(),
                        "Ignored duplicate " + commandType + " command " + normalizedCommandId + ".",
                        Instant.ofEpochMilli(now()));
                pushRecentCommand(duplicate);
                return duplicate;
            }
        }
        return action.run();
    }

    private CommandOutcomeView rememberOutcome(
            String commandId,
            String aggregateId,
            String commandType,
            boolean duplicate,
            long resultingVersion,
            String message) {
        String effectiveCommandId = commandId == null ? "generated-" + now() : commandId;
        CommandOutcomeView outcome = new CommandOutcomeView(
                effectiveCommandId,
                aggregateId,
                commandType,
                duplicate,
                resultingVersion,
                message,
                Instant.ofEpochMilli(now()));
        if (commandId != null) {
            commandDedup.put(commandId, outcome);
        }
        pushRecentCommand(outcome);
        return outcome;
    }

    private void pushRecentCommand(CommandOutcomeView outcome) {
        recentCommands.addFirst(outcome);
        while (recentCommands.size() > recentCommandLimit) {
            recentCommands.removeLast();
        }
    }

    private StoredEvent appendEvent(String aggregateId, long aggregateVersion, String eventType, Map<String, Object> data) {
        StoredEvent event = new StoredEvent(
                nextEventId++,
                aggregateId,
                aggregateVersion,
                eventType,
                new LinkedHashMap<>(data),
                now());
        eventStore.computeIfAbsent(aggregateId, key -> new ArrayList<>()).add(event);
        applyProjectionEvent(event);
        return event;
    }

    private void maybeCreateSnapshot(String orderId) {
        OrderAggregate aggregate = loadAggregate(orderId);
        if (aggregate.version % snapshotFrequency != 0) {
            return;
        }
        snapshots.put(orderId, new OrderSnapshotState(
                orderId,
                aggregate.customerId,
                aggregate.status,
                aggregate.version,
                copyItems(aggregate.items),
                aggregate.totalQuantity,
                aggregate.totalAmount,
                now()));
    }

    private void rebuildProjectionFor(String orderId) {
        OrderAggregate aggregate = loadAggregate(orderId);
        projections.put(orderId, new OrderProjection(
                aggregate.id,
                aggregate.customerId,
                aggregate.status,
                aggregate.version,
                copyItems(aggregate.items),
                aggregate.totalQuantity,
                roundMoney(aggregate.totalAmount),
                now()));
        projectionVersion = Math.max(projectionVersion, aggregate.version);
    }

    private void applyProjectionEvent(StoredEvent event) {
        OrderProjection projection = projections.computeIfAbsent(event.aggregateId, key -> new OrderProjection(
                event.aggregateId, null, OrderStatus.DRAFT, 0L, new TreeMap<>(), 0, 0.0, event.occurredAtMillis));
        switch (event.eventType) {
            case "OrderCreated" -> projection.customerId = stringData(event.data, "customerId");
            case "ItemAdded" -> {
                String sku = stringData(event.data, "sku");
                int quantity = intData(event.data, "quantity");
                double unitPrice = doubleData(event.data, "unitPrice");
                OrderItemState item = projection.items.computeIfAbsent(sku, key -> new OrderItemState(sku, 0, unitPrice));
                item.quantity += quantity;
                item.unitPrice = unitPrice;
                projection.totalQuantity += quantity;
                projection.totalAmount = roundMoney(projection.totalAmount + (quantity * unitPrice));
            }
            case "OrderConfirmed" -> projection.status = OrderStatus.CONFIRMED;
            case "OrderCancelled" -> projection.status = OrderStatus.CANCELLED;
            default -> throw new IllegalArgumentException("Unsupported event type " + event.eventType + ".");
        }
        projection.version = event.aggregateVersion;
        projection.lastUpdatedAtMillis = event.occurredAtMillis;
        projectionVersion = Math.max(projectionVersion, event.eventId);
    }

    private OrderAggregate loadAggregate(String orderId) {
        List<StoredEvent> stream = eventStore.get(orderId);
        if (stream == null || stream.isEmpty()) {
            throw new IllegalArgumentException("Order " + orderId + " does not exist.");
        }
        OrderSnapshotState snapshot = snapshots.get(orderId);
        OrderAggregate aggregate = snapshot == null
                ? new OrderAggregate(orderId)
                : new OrderAggregate(orderId, snapshot.customerId, snapshot.status, snapshot.version, copyItems(snapshot.items),
                snapshot.totalQuantity, snapshot.totalAmount);
        for (StoredEvent event : stream) {
            if (event.aggregateVersion <= aggregate.version) {
                continue;
            }
            applyAggregateEvent(aggregate, event);
        }
        return aggregate;
    }

    private void applyAggregateEvent(OrderAggregate aggregate, StoredEvent event) {
        switch (event.eventType) {
            case "OrderCreated" -> {
                aggregate.customerId = stringData(event.data, "customerId");
                aggregate.status = OrderStatus.DRAFT;
            }
            case "ItemAdded" -> {
                String sku = stringData(event.data, "sku");
                int quantity = intData(event.data, "quantity");
                double unitPrice = doubleData(event.data, "unitPrice");
                OrderItemState item = aggregate.items.computeIfAbsent(sku, key -> new OrderItemState(sku, 0, unitPrice));
                item.quantity += quantity;
                item.unitPrice = unitPrice;
                aggregate.totalQuantity += quantity;
                aggregate.totalAmount = roundMoney(aggregate.totalAmount + (quantity * unitPrice));
            }
            case "OrderConfirmed" -> aggregate.status = OrderStatus.CONFIRMED;
            case "OrderCancelled" -> aggregate.status = OrderStatus.CANCELLED;
            default -> throw new IllegalArgumentException("Unsupported event type " + event.eventType + ".");
        }
        aggregate.version = event.aggregateVersion;
    }

    private List<StoredEvent> allEvents() {
        return eventStore.values().stream()
                .flatMap(List::stream)
                .sorted(Comparator.comparingLong(StoredEvent::eventId))
                .toList();
    }

    private StoredEventView toStoredEventView(StoredEvent event) {
        return new StoredEventView(
                event.eventId,
                event.aggregateId,
                event.aggregateVersion,
                event.eventType,
                Instant.ofEpochMilli(event.occurredAtMillis),
                Map.copyOf(event.data));
    }

    private SnapshotView toSnapshotView(OrderSnapshotState snapshot) {
        return new SnapshotView(
                snapshot.orderId,
                snapshot.version,
                snapshot.status.name(),
                snapshot.totalQuantity,
                roundMoney(snapshot.totalAmount),
                Instant.ofEpochMilli(snapshot.createdAtMillis));
    }

    private OrderSummaryView toOrderSummary(OrderProjection projection) {
        return new OrderSummaryView(
                projection.orderId,
                projection.customerId,
                projection.status.name(),
                projection.version,
                projection.items.size(),
                projection.totalQuantity,
                roundMoney(projection.totalAmount),
                Instant.ofEpochMilli(projection.lastUpdatedAtMillis),
                projection.items.values().stream()
                        .sorted(Comparator.comparing(OrderItemState::sku))
                        .map(item -> new OrderItemView(
                                item.sku,
                                item.quantity,
                                roundMoney(item.unitPrice),
                                roundMoney(item.quantity * item.unitPrice)))
                        .toList());
    }

    private Map<String, OrderItemState> copyItems(Map<String, OrderItemState> source) {
        Map<String, OrderItemState> copy = new TreeMap<>();
        for (OrderItemState item : source.values()) {
            copy.put(item.sku, new OrderItemState(item.sku, item.quantity, item.unitPrice));
        }
        return copy;
    }

    private void requireVersion(long actualVersion, long expectedVersion) {
        if (actualVersion != expectedVersion) {
            throw new IllegalArgumentException("Version conflict. Expected " + expectedVersion + " but found " + actualVersion + ".");
        }
    }

    private String normalizeId(String raw, String fieldName) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException(fieldName + " is required.");
        }
        String value = raw.trim();
        if (value.length() > 40 || !ID_PATTERN.matcher(value).matches()) {
            throw new IllegalArgumentException(fieldName + " must match " + ID_PATTERN.pattern() + " and be at most 40 chars.");
        }
        return value;
    }

    private String normalizedCommandId(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return normalizeId(raw, "commandId");
    }

    private String normalizeReason(String raw) {
        if (raw == null || raw.isBlank()) {
            return "cancelled-by-user";
        }
        String value = raw.trim();
        if (value.length() > 120) {
            throw new IllegalArgumentException("reason must be at most 120 chars.");
        }
        return value;
    }

    private long normalizeExpectedVersion(Long version) {
        if (version == null || version < 0) {
            throw new IllegalArgumentException("expectedVersion must be >= 0.");
        }
        return version;
    }

    private int requirePositive(Integer value, String fieldName) {
        if (value == null || value < 1) {
            throw new IllegalArgumentException(fieldName + " must be at least 1.");
        }
        return value;
    }

    private double requirePositiveMoney(Double value, String fieldName) {
        if (value == null || value <= 0.0d) {
            throw new IllegalArgumentException(fieldName + " must be greater than 0.");
        }
        return roundMoney(value);
    }

    private String stringData(Map<String, Object> data, String key) {
        Object value = data.get(key);
        return value == null ? null : String.valueOf(value);
    }

    private int intData(Map<String, Object> data, String key) {
        Object value = data.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.parseInt(Objects.toString(value));
    }

    private double doubleData(Map<String, Object> data, String key) {
        Object value = data.get(key);
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        return Double.parseDouble(Objects.toString(value));
    }

    private double roundMoney(double value) {
        return Math.round(value * 100.0d) / 100.0d;
    }

    private long now() {
        return timeSource.getAsLong();
    }

    private interface CommandAction {
        CommandOutcomeView run();
    }

    private enum OrderStatus {
        DRAFT,
        CONFIRMED,
        CANCELLED
    }

    private static final class StoredEvent {
        private final long eventId;
        private final String aggregateId;
        private final long aggregateVersion;
        private final String eventType;
        private final Map<String, Object> data;
        private final long occurredAtMillis;

        private StoredEvent(
                long eventId,
                String aggregateId,
                long aggregateVersion,
                String eventType,
                Map<String, Object> data,
                long occurredAtMillis) {
            this.eventId = eventId;
            this.aggregateId = aggregateId;
            this.aggregateVersion = aggregateVersion;
            this.eventType = eventType;
            this.data = data;
            this.occurredAtMillis = occurredAtMillis;
        }

        private long eventId() {
            return eventId;
        }
    }

    private static final class OrderAggregate {
        private final String id;
        private String customerId;
        private OrderStatus status;
        private long version;
        private final Map<String, OrderItemState> items;
        private int totalQuantity;
        private double totalAmount;

        private OrderAggregate(String id) {
            this(id, null, OrderStatus.DRAFT, 0L, new TreeMap<>(), 0, 0.0d);
        }

        private OrderAggregate(
                String id,
                String customerId,
                OrderStatus status,
                long version,
                Map<String, OrderItemState> items,
                int totalQuantity,
                double totalAmount) {
            this.id = id;
            this.customerId = customerId;
            this.status = status;
            this.version = version;
            this.items = items;
            this.totalQuantity = totalQuantity;
            this.totalAmount = totalAmount;
        }
    }

    private static final class OrderProjection {
        private final String orderId;
        private String customerId;
        private OrderStatus status;
        private long version;
        private final Map<String, OrderItemState> items;
        private int totalQuantity;
        private double totalAmount;
        private long lastUpdatedAtMillis;

        private OrderProjection(
                String orderId,
                String customerId,
                OrderStatus status,
                long version,
                Map<String, OrderItemState> items,
                int totalQuantity,
                double totalAmount,
                long lastUpdatedAtMillis) {
            this.orderId = orderId;
            this.customerId = customerId;
            this.status = status;
            this.version = version;
            this.items = items;
            this.totalQuantity = totalQuantity;
            this.totalAmount = totalAmount;
            this.lastUpdatedAtMillis = lastUpdatedAtMillis;
        }

        private String orderId() {
            return orderId;
        }
    }

    private static final class OrderItemState {
        private final String sku;
        private int quantity;
        private double unitPrice;

        private OrderItemState(String sku, int quantity, double unitPrice) {
            this.sku = sku;
            this.quantity = quantity;
            this.unitPrice = unitPrice;
        }

        private String sku() {
            return sku;
        }
    }

    private static final class OrderSnapshotState {
        private final String orderId;
        private final String customerId;
        private final OrderStatus status;
        private final long version;
        private final Map<String, OrderItemState> items;
        private final int totalQuantity;
        private final double totalAmount;
        private final long createdAtMillis;

        private OrderSnapshotState(
                String orderId,
                String customerId,
                OrderStatus status,
                long version,
                Map<String, OrderItemState> items,
                int totalQuantity,
                double totalAmount,
                long createdAtMillis) {
            this.orderId = orderId;
            this.customerId = customerId;
            this.status = status;
            this.version = version;
            this.items = items;
            this.totalQuantity = totalQuantity;
            this.totalAmount = totalAmount;
            this.createdAtMillis = createdAtMillis;
        }

        private String orderId() {
            return orderId;
        }
    }
}
