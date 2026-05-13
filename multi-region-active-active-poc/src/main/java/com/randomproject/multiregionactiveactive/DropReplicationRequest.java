package com.randomproject.multiregionactiveactive;

public record DropReplicationRequest(
        String sourceRegionId,
        String targetRegionId,
        String cartId) {
}
