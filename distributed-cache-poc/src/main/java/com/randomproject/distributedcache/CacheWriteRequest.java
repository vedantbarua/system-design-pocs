package com.randomproject.distributedcache;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record CacheWriteRequest(
        @NotBlank String key,
        @NotBlank String value,
        @Min(1) @Max(3600) Integer ttlSeconds) {
}
