package com.randomproject.distributedcache;

import java.time.Instant;

public record ClusterEvent(
        String category,
        String message,
        Instant timestamp) {
}
