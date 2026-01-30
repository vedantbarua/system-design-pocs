package com.randomproject.uber;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RiderRequest(
        @NotBlank
        @Size(max = 64)
        @Pattern(regexp = "^[A-Za-z0-9._:-]+$")
        String id,
        @NotBlank
        @Size(max = 120)
        String name,
        @DecimalMin("1.0")
        @DecimalMax("5.0")
        Double rating,
        @NotBlank
        @Size(max = 60)
        String homeZone
) {
}
