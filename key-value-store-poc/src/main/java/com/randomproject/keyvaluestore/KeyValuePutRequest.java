package com.randomproject.keyvaluestore;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record KeyValuePutRequest(
        @NotBlank
        @Size(max = 64)
        @Pattern(regexp = "^[A-Za-z0-9._:-]+$")
        String key,
        @NotBlank
        @Size(max = 2000)
        String value,
        @Min(1)
        Integer ttlSeconds
) {
}
