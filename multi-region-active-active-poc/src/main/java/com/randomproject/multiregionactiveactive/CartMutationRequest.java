package com.randomproject.multiregionactiveactive;

public record CartMutationRequest(
        String regionId,
        String cartId,
        String sku,
        Integer quantityDelta,
        ConflictStrategy strategy) {
}
