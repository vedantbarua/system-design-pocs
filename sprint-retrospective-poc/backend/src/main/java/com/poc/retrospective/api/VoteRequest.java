package com.poc.retrospective.api;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

public record VoteRequest(@Min(-3) @Max(3) int delta) {
}
