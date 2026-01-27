package com.randomproject.netflix;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;

public record CatalogUpsertRequest(
        @NotBlank String id,
        @NotBlank String title,
        @NotNull CatalogType type,
        @NotNull @Min(1900) @Max(2100) Integer year,
        @NotNull @Min(1) @Max(1000) Integer durationMinutes,
        @NotBlank String maturityRating,
        List<String> genres,
        String description,
        @Min(0) @Max(100) Integer popularity
) {
}
