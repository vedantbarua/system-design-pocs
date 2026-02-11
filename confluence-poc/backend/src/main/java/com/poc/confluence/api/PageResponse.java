package com.poc.confluence.api;

import com.poc.confluence.model.PageStatus;
import java.time.Instant;
import java.util.List;

public record PageResponse(
    long id,
    long spaceId,
    String title,
    String body,
    PageStatus status,
    int version,
    String lastEditedBy,
    Instant lastUpdatedAt,
    List<String> labels
) {}
