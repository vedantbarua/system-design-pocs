package com.randomproject.ticketmaster;

import java.math.BigDecimal;
import java.time.Instant;

public class TicketTier {
    private final String id;
    private final String eventId;
    private final String name;
    private final BigDecimal price;
    private final int capacity;
    private final int soldCount;
    private final int heldCount;
    private final Instant createdAt;
    private final Instant updatedAt;

    public TicketTier(String id,
                      String eventId,
                      String name,
                      BigDecimal price,
                      int capacity,
                      int soldCount,
                      int heldCount,
                      Instant createdAt,
                      Instant updatedAt) {
        this.id = id;
        this.eventId = eventId;
        this.name = name;
        this.price = price;
        this.capacity = capacity;
        this.soldCount = soldCount;
        this.heldCount = heldCount;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() {
        return id;
    }

    public String getEventId() {
        return eventId;
    }

    public String getName() {
        return name;
    }

    public BigDecimal getPrice() {
        return price;
    }

    public int getCapacity() {
        return capacity;
    }

    public int getSoldCount() {
        return soldCount;
    }

    public int getHeldCount() {
        return heldCount;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public int getAvailable() {
        return Math.max(0, capacity - soldCount - heldCount);
    }

    public TicketTier withHold(int quantity, Instant updatedAt) {
        return new TicketTier(id, eventId, name, price, capacity, soldCount, heldCount + quantity, createdAt, updatedAt);
    }

    public TicketTier withReleaseHold(int quantity, Instant updatedAt) {
        return new TicketTier(id, eventId, name, price, capacity, soldCount, Math.max(0, heldCount - quantity),
                createdAt, updatedAt);
    }

    public TicketTier withSale(int quantity, Instant updatedAt) {
        return new TicketTier(id, eventId, name, price, capacity, soldCount + quantity, heldCount, createdAt, updatedAt);
    }

    public TicketTier withSaleFromHold(int quantity, Instant updatedAt) {
        return new TicketTier(id, eventId, name, price, capacity, soldCount + quantity,
                Math.max(0, heldCount - quantity), createdAt, updatedAt);
    }
}
