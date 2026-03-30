package com.randomproject.cdn;

public record DeliveryResponse(
        String path,
        String edgeId,
        String region,
        String cacheStatus,
        int version,
        long ttlRemainingSeconds,
        int estimatedLatencyMs,
        String content
) {
}
