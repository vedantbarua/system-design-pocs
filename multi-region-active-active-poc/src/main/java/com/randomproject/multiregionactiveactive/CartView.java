package com.randomproject.multiregionactiveactive;

import java.util.List;
import java.util.Map;

public record CartView(
        String cartId,
        List<CartItemView> items,
        Map<String, Long> vectorClock,
        long version,
        String lastWriterRegion,
        long updatedAt,
        boolean hasConflict) {
}
