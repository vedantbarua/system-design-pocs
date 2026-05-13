package com.randomproject.multiregionactiveactive;

import java.util.List;
import java.util.Map;

public record ConflictView(
        String regionId,
        String cartId,
        long localVersion,
        long incomingVersion,
        Map<String, Long> localVectorClock,
        Map<String, Long> incomingVectorClock,
        List<CartItemView> localItems,
        List<CartItemView> incomingItems,
        long detectedAt) {
}
