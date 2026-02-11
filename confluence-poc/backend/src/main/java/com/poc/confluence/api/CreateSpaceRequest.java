package com.poc.confluence.api;

import jakarta.validation.constraints.NotBlank;

public record CreateSpaceRequest(
    @NotBlank String key,
    @NotBlank String name,
    @NotBlank String owner
) {}
