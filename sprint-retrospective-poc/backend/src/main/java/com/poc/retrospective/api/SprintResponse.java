package com.poc.retrospective.api;

import java.time.Instant;
import java.time.LocalDate;

public record SprintResponse(
    long id,
    long teamId,
    String name,
    LocalDate startDate,
    LocalDate endDate,
    Instant createdAt
) {
}
