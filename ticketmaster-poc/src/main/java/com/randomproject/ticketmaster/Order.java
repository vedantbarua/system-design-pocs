package com.randomproject.ticketmaster;

import java.math.BigDecimal;
import java.time.Instant;

public class Order {
    private final String id;
    private final String eventId;
    private final String tierId;
    private final String customer;
    private final int quantity;
    private final BigDecimal unitPrice;
    private final BigDecimal fees;
    private final BigDecimal total;
    private final OrderStatus status;
    private final Instant createdAt;

    public Order(String id,
                 String eventId,
                 String tierId,
                 String customer,
                 int quantity,
                 BigDecimal unitPrice,
                 BigDecimal fees,
                 BigDecimal total,
                 OrderStatus status,
                 Instant createdAt) {
        this.id = id;
        this.eventId = eventId;
        this.tierId = tierId;
        this.customer = customer;
        this.quantity = quantity;
        this.unitPrice = unitPrice;
        this.fees = fees;
        this.total = total;
        this.status = status;
        this.createdAt = createdAt;
    }

    public String getId() {
        return id;
    }

    public String getEventId() {
        return eventId;
    }

    public String getTierId() {
        return tierId;
    }

    public String getCustomer() {
        return customer;
    }

    public int getQuantity() {
        return quantity;
    }

    public BigDecimal getUnitPrice() {
        return unitPrice;
    }

    public BigDecimal getFees() {
        return fees;
    }

    public BigDecimal getTotal() {
        return total;
    }

    public OrderStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
