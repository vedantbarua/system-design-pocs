package com.randomproject.urlshortner;

import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicLong;

public class ShortLink {
    private final String code;
    private final String targetUrl;
    private final LocalDateTime createdAt;
    private final AtomicLong hits = new AtomicLong();

    public ShortLink(String code, String targetUrl) {
        this.code = code;
        this.targetUrl = targetUrl;
        this.createdAt = LocalDateTime.now();
    }

    public String getCode() {
        return code;
    }

    public String getTargetUrl() {
        return targetUrl;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public long getHits() {
        return hits.get();
    }

    public void incrementHits() {
        hits.incrementAndGet();
    }
}
