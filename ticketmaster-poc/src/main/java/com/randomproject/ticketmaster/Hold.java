package com.randomproject.ticketmaster;

import java.time.Instant;

public class Hold {
    private final String id;
    private final String eventId;
    private final String tierId;
    private final String customer;
    private final int quantity;
    private final HoldStatus status;
    private final Instant createdAt;
    private final Instant expiresAt;
    private final Instant updatedAt;

    public Hold(String id,
                String eventId,
                String tierId,
                String customer,
                int quantity,
                HoldStatus status,
                Instant createdAt,
                Instant expiresAt,
                Instant updatedAt) {
        this.id = id;
        this.eventId = eventId;
        this.tierId = tierId;
        this.customer = customer;
        this.quantity = quantity;
        this.status = status;
        this.createdAt = createdAt;
        this.expiresAt = expiresAt;
        this.updatedAt = updatedAt;
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

    public HoldStatus getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getExpiresAt() {
        return expiresAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public boolean isExpired(Instant now) {
        return status == HoldStatus.ACTIVE && now.isAfter(expiresAt);
    }

    public Hold withStatus(HoldStatus status, Instant updatedAt) {
        return new Hold(id, eventId, tierId, customer, quantity, status, createdAt, expiresAt, updatedAt);
    }
}
