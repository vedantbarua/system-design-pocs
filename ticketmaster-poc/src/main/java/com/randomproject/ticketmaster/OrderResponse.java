package com.randomproject.ticketmaster;

import java.math.BigDecimal;
import java.time.Instant;

public record OrderResponse(String id,
                            String eventId,
                            String tierId,
                            String customer,
                            int quantity,
                            BigDecimal unitPrice,
                            BigDecimal fees,
                            BigDecimal total,
                            OrderStatus status,
                            Instant createdAt) {
}
