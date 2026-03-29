package com.randomproject.eventsourcingcqrs;

import java.time.Instant;
import java.util.List;
import java.util.Map;

record EventConfigView(
        int snapshotFrequency,
        int recentEventLimit,
        int recentCommandLimit) {
}

record EventSourcingSnapshotView(
        EventConfigView config,
        OrderMetricsView metrics,
        List<OrderSummaryView> orders,
        List<StoredEventView> recentEvents,
        List<SnapshotView> snapshots,
        List<CommandOutcomeView> recentCommands) {
}

record OrderMetricsView(
        int aggregateCount,
        int totalEvents,
        int totalSnapshots,
        int draftOrders,
        int confirmedOrders,
        int cancelledOrders,
        int totalQuantity,
        double totalRevenue,
        long projectionVersion) {
}

record OrderSummaryView(
        String orderId,
        String customerId,
        String status,
        long version,
        int distinctItems,
        int totalQuantity,
        double totalAmount,
        Instant lastUpdatedAt,
        List<OrderItemView> items) {
}

record OrderItemView(
        String sku,
        int quantity,
        double unitPrice,
        double lineTotal) {
}

record StoredEventView(
        long eventId,
        String aggregateId,
        long aggregateVersion,
        String eventType,
        Instant occurredAt,
        Map<String, Object> data) {
}

record SnapshotView(
        String orderId,
        long version,
        String status,
        int totalQuantity,
        double totalAmount,
        Instant createdAt) {
}

record CommandOutcomeView(
        String commandId,
        String aggregateId,
        String commandType,
        boolean duplicate,
        long resultingVersion,
        String message,
        Instant handledAt) {
}
