package com.randomproject.searchengine;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record SearchQueryRequest(
        @Size(min = 1, max = 120, message = "Query must be between 1 and 120 characters.")
        String query,
        @Min(value = 1, message = "Limit must be at least 1.")
        @Max(value = 20, message = "Limit must be at most 20.")
        Integer limit
) {
}
