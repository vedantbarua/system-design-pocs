package com.randomproject.cdcmaterializedview;

import java.util.List;

public record SystemSnapshot(
        ConnectorView connector,
        int sourceOrderCount,
        int changeLogCount,
        List<OrderView> sourceOrders,
        List<ChangeEventView> changeLog,
        ProjectionView projections,
        List<String> recentEvents) {
}
