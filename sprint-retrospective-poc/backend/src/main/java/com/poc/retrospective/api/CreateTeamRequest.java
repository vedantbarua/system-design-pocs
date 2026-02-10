package com.poc.retrospective.api;

import jakarta.validation.constraints.NotBlank;

public record CreateTeamRequest(@NotBlank String name) {
}
