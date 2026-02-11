package com.poc.confluence.api;

import java.time.Instant;

public record SpaceResponse(
    long id,
    String key,
    String name,
    String owner,
    Instant createdAt,
    int pageCount
) {}
