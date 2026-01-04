package com.randomproject.urlshortner;

import java.time.LocalDateTime;

public record ShortLinkResponse(
        String code,
        String targetUrl,
        String shortUrl,
        long hits,
        LocalDateTime createdAt
) {
}
