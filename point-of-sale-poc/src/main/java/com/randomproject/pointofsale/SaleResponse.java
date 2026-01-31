package com.randomproject.pointofsale;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record SaleResponse(
        String id,
        List<SaleLine> lines,
        BigDecimal subtotal,
        BigDecimal tax,
        BigDecimal total,
        BigDecimal amountTendered,
        BigDecimal changeDue,
        String paymentMethod,
        Instant createdAt
) {
}
