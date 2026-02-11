package com.poc.confluence.api;

import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record CreatePageRequest(
    @NotBlank String title,
    String body,
    List<String> labels,
    @NotBlank String author
) {}
