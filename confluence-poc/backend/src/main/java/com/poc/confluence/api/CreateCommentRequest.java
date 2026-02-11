package com.poc.confluence.api;

import jakarta.validation.constraints.NotBlank;

public record CreateCommentRequest(
    @NotBlank String author,
    @NotBlank String text
) {}
