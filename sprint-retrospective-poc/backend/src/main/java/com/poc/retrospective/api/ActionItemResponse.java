package com.poc.retrospective.api;

import com.poc.retrospective.model.ActionStatus;
import java.time.Instant;
import java.time.LocalDate;

public record ActionItemResponse(
    long id,
    long sprintId,
    String text,
    String owner,
    LocalDate dueDate,
    long sourceItemId,
    ActionStatus status,
    Instant createdAt
) {
}
