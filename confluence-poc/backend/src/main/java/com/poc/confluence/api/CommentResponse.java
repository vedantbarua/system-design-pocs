package com.poc.confluence.api;

import java.time.Instant;

public record CommentResponse(
    long id,
    long pageId,
    String author,
    String text,
    Instant createdAt
) {}
