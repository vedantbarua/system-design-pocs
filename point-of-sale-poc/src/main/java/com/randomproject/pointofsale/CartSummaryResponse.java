package com.randomproject.pointofsale;

import java.math.BigDecimal;
import java.util.List;

public record CartSummaryResponse(
        List<CartLine> lines,
        BigDecimal subtotal,
        BigDecimal tax,
        BigDecimal total,
        int itemCount
) {
}
