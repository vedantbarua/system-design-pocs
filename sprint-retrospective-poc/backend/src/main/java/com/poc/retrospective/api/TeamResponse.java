package com.poc.retrospective.api;

import java.time.Instant;

public record TeamResponse(long id, String name, Instant createdAt) {
}
