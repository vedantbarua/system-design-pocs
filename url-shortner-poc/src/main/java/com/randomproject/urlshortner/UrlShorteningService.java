package com.randomproject.urlshortner;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URI;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class UrlShorteningService {
    private final Map<String, ShortLink> links = new ConcurrentHashMap<>();
    private final AtomicLong sequence = new AtomicLong(1000);

    public Collection<ShortLink> all() {
        return new ArrayList<>(links.values());
    }

    public synchronized ShortLink create(String rawUrl, String desiredCode) {
        String normalizedUrl = normalizeUrl(rawUrl);
        String code = StringUtils.hasText(desiredCode) ? desiredCode.trim() : nextCode();
        if (!StringUtils.hasText(code)) {
            throw new IllegalArgumentException("Short code cannot be blank.");
        }
        if (links.containsKey(code)) {
            throw new IllegalArgumentException("Short code already exists: " + code);
        }
        ShortLink link = new ShortLink(code, normalizedUrl);
        links.put(code, link);
        return link;
    }

    public Optional<ShortLink> resolve(String code) {
        ShortLink link = links.get(code);
        if (link != null) {
            link.incrementHits();
        }
        return Optional.ofNullable(link);
    }

    public Optional<ShortLink> find(String code) {
        return Optional.ofNullable(links.get(code));
    }

    private String nextCode() {
        long value = sequence.incrementAndGet();
        return Long.toString(value, 36);
    }

    private String normalizeUrl(String raw) {
        if (!StringUtils.hasText(raw)) {
            throw new IllegalArgumentException("Target URL cannot be empty.");
        }
        String trimmed = raw.trim();
        String withScheme = trimmed.matches("^[a-zA-Z][a-zA-Z0-9+\\-.]*://.*")
                ? trimmed
                : "https://" + trimmed;
        URI uri = URI.create(withScheme);
        if (!StringUtils.hasText(uri.getHost())) {
            throw new IllegalArgumentException("Invalid URL: " + raw);
        }
        return uri.toString();
    }
}
