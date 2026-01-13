package com.randomproject.pricetracker;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.regex.Pattern;

@Service
public class PriceTrackerService {
    private static final Pattern ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:-]+$");
    private final Map<String, PriceTrackerItem> items = new ConcurrentHashMap<>();

    public synchronized List<PriceTrackerItem> all() {
        return new ArrayList<>(items.values());
    }

    public synchronized Optional<PriceTrackerItem> get(String id) {
        if (!StringUtils.hasText(id)) {
            return Optional.empty();
        }
        return Optional.ofNullable(items.get(id.trim()));
    }

    public synchronized List<PriceTrackerItem> alerts() {
        return items.values().stream()
                .filter(PriceTrackerItem::isBelowTarget)
                .toList();
    }

    public synchronized PriceTrackerItem track(String id,
                                               String name,
                                               String url,
                                               BigDecimal targetPrice,
                                               BigDecimal currentPrice) {
        String normalizedId = normalizeId(id);
        String normalizedName = normalizeName(name);
        String normalizedUrl = normalizeUrl(url);
        BigDecimal normalizedTarget = normalizePrice("Target price", targetPrice);
        BigDecimal normalizedCurrent = normalizePrice("Current price", currentPrice);
        Instant now = Instant.now();
        PriceTrackerItem existing = items.get(normalizedId);
        Instant createdAt = existing == null ? now : existing.getCreatedAt();
        PriceTrackerItem item = new PriceTrackerItem(
                normalizedId,
                normalizedName,
                normalizedUrl,
                normalizedTarget,
                normalizedCurrent,
                createdAt,
                now);
        items.put(normalizedId, item);
        return item;
    }

    public synchronized PriceTrackerItem updatePrice(String id, BigDecimal currentPrice) {
        String normalizedId = normalizeId(id);
        BigDecimal normalizedCurrent = normalizePrice("Current price", currentPrice);
        PriceTrackerItem existing = items.get(normalizedId);
        if (existing == null) {
            throw new IllegalArgumentException("Unknown item: " + normalizedId);
        }
        Instant now = Instant.now();
        PriceTrackerItem item = new PriceTrackerItem(
                existing.getId(),
                existing.getName(),
                existing.getUrl(),
                existing.getTargetPrice(),
                normalizedCurrent,
                existing.getCreatedAt(),
                now);
        items.put(normalizedId, item);
        return item;
    }

    public synchronized boolean delete(String id) {
        if (!StringUtils.hasText(id)) {
            return false;
        }
        return items.remove(id.trim()) != null;
    }

    private String normalizeId(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("Item id cannot be empty.");
        }
        String normalized = id.trim();
        if (!ID_PATTERN.matcher(normalized).matches()) {
            throw new IllegalArgumentException("Item id must use letters, numbers, '.', '-', '_', or ':'.");
        }
        return normalized;
    }

    private String normalizeName(String name) {
        if (!StringUtils.hasText(name)) {
            throw new IllegalArgumentException("Name cannot be empty.");
        }
        return name.trim();
    }

    private String normalizeUrl(String url) {
        if (!StringUtils.hasText(url)) {
            return null;
        }
        String normalized = url.trim();
        if (!(normalized.startsWith("http://") || normalized.startsWith("https://"))) {
            throw new IllegalArgumentException("URL must start with http:// or https://.");
        }
        return normalized;
    }

    private BigDecimal normalizePrice(String label, BigDecimal price) {
        if (price == null) {
            throw new IllegalArgumentException(label + " is required.");
        }
        if (price.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException(label + " must be greater than zero.");
        }
        return price;
    }
}
