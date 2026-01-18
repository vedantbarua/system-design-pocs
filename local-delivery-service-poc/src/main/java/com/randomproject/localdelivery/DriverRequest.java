package com.randomproject.localdelivery;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record DriverRequest(
        @NotBlank
        @Size(max = 64)
        @Pattern(regexp = "^[A-Za-z0-9._:-]+$")
        String id,
        @NotBlank
        @Size(max = 120)
        String name,
        @NotBlank
        @Size(max = 80)
        String vehicleType,
        @NotNull
        DriverStatus status
) {
}
