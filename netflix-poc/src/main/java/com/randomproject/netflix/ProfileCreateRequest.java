package com.randomproject.netflix;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

public record ProfileCreateRequest(
        @NotBlank String name,
        List<String> favoriteGenres,
        String maturityLimit
) {
}
