package com.poc.retrospective.api;

import com.poc.retrospective.model.ItemType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record CreateItemRequest(
    @NotNull ItemType type,
    @NotBlank String text,
    @NotBlank String author
) {
}
