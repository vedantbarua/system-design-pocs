package com.randomproject.urlshortner;

import jakarta.validation.constraints.NotBlank;

public record ShortenRequest(
        @NotBlank String url,
        String alias
) {
}
