package com.randomproject.distributedcache;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;

public record HotKeyRequest(
        @NotBlank String key,
        @Min(1) @Max(500) Integer requests) {
}
