package com.randomproject.multiregionactiveactive;

import java.util.List;

public record RegionView(
        String regionId,
        boolean active,
        long localClock,
        int cartCount,
        List<CartView> carts) {
}
