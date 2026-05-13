package com.randomproject.multiregionactiveactive;

public record DrainReplicationRequest(
        String targetRegionId,
        Integer maxEvents,
        ConflictStrategy strategy) {
}
