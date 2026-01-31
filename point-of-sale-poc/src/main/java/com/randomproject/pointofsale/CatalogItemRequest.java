package com.randomproject.pointofsale;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.math.BigDecimal;

public record CatalogItemRequest(
        @NotBlank
        @Size(max = 64)
        @Pattern(regexp = "^[A-Za-z0-9._:-]+$")
        String id,
        @NotBlank
        @Size(max = 120)
        String name,
        @Size(max = 80)
        String category,
        @NotNull
        @DecimalMin("0.01")
        BigDecimal price
) {
}
