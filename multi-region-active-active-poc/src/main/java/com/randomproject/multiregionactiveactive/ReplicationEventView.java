package com.randomproject.multiregionactiveactive;

import java.util.Map;

public record ReplicationEventView(
        long eventId,
        String sourceRegionId,
        String targetRegionId,
        String cartId,
        long version,
        Map<String, Long> vectorClock,
        ReplicationStatus status,
        String reason) {
}
