package com.poc.confluence.api;

import com.poc.confluence.model.PageStatus;
import jakarta.validation.constraints.NotBlank;
import java.util.List;

public record UpdatePageRequest(
    @NotBlank String title,
    String body,
    List<String> labels,
    PageStatus status,
    @NotBlank String editor
) {}
