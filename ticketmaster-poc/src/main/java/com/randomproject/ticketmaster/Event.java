package com.randomproject.ticketmaster;

import java.time.Instant;
import java.time.LocalDateTime;

public class Event {
    private final String id;
    private final String name;
    private final EventCategory category;
    private final String venueId;
    private final LocalDateTime startsAt;
    private final String headliner;
    private final String description;
    private final Instant createdAt;
    private final Instant updatedAt;
    private final EventStatus status;

    public Event(String id,
                 String name,
                 EventCategory category,
                 String venueId,
                 LocalDateTime startsAt,
                 String headliner,
                 String description,
                 Instant createdAt,
                 Instant updatedAt,
                 EventStatus status) {
        this.id = id;
        this.name = name;
        this.category = category;
        this.venueId = venueId;
        this.startsAt = startsAt;
        this.headliner = headliner;
        this.description = description;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.status = status;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public EventCategory getCategory() {
        return category;
    }

    public String getVenueId() {
        return venueId;
    }

    public LocalDateTime getStartsAt() {
        return startsAt;
    }

    public String getHeadliner() {
        return headliner;
    }

    public String getDescription() {
        return description;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public EventStatus getStatus() {
        return status;
    }

    public Event withStatus(EventStatus status, Instant updatedAt) {
        return new Event(id, name, category, venueId, startsAt, headliner, description, createdAt, updatedAt, status);
    }
}
