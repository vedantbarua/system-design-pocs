package com.randomproject.barmenu;

import jakarta.validation.constraints.NotBlank;

public record StartPrepRequest(@NotBlank String drinkId) {
}
