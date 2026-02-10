package com.poc.retrospective.api;

import com.poc.retrospective.model.ItemType;
import java.time.Instant;

public record RetroItemResponse(
    long id,
    long sprintId,
    ItemType type,
    String text,
    String author,
    int votes,
    Long actionItemId,
    Instant createdAt
) {
}
