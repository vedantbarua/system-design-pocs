package com.poc.retrospective.api;

import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

public record ConvertActionRequest(
    @NotBlank String owner,
    LocalDate dueDate,
    String overrideText
) {
}
