package com.randomproject.designdropbox;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateShareLinkRequest(
        @NotBlank
        @Size(max = 64)
        String fileId,
        Integer ttlMinutes
) {
}
