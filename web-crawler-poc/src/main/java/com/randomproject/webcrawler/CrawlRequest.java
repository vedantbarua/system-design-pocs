package com.randomproject.webcrawler;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record CrawlRequest(
        @NotBlank
        @Size(max = 2048)
        @Pattern(regexp = "^https?://.+")
        String startUrl,
        @Min(0)
        Integer maxDepth,
        @Min(1)
        Integer maxPages,
        @Min(0)
        Integer delayMillis,
        Boolean sameHostOnly
) {
}
