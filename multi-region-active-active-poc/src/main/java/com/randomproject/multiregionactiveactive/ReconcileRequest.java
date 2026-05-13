package com.randomproject.multiregionactiveactive;

public record ReconcileRequest(
        String regionId,
        String cartId,
        ConflictStrategy strategy) {
}
