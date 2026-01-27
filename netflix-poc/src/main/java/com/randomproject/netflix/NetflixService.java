package com.randomproject.netflix;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.Year;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

@Service
public class NetflixService {
    private final int defaultLimit;
    private final int maxLimit;
    private final int continueLimit;
    private final int maxGenres;
    private final int maxIdLength;
    private final int maxTitleLength;
    private final int maxDescriptionLength;
    private final double genreWeight;
    private final double popularityWeight;
    private final double recencyWeight;

    private final Map<String, CatalogItem> catalog = new LinkedHashMap<>();
    private final Map<String, Profile> profiles = new LinkedHashMap<>();
    private final Map<String, Set<String>> watchlists = new HashMap<>();
    private final Map<String, Map<String, WatchProgress>> progress = new HashMap<>();

    public NetflixService(
            @Value("${netflix.default-limit:6}") int defaultLimit,
            @Value("${netflix.max-limit:24}") int maxLimit,
            @Value("${netflix.continue-limit:6}") int continueLimit,
            @Value("${netflix.max-genres:6}") int maxGenres,
            @Value("${netflix.max-id-length:40}") int maxIdLength,
            @Value("${netflix.max-title-length:120}") int maxTitleLength,
            @Value("${netflix.max-description-length:360}") int maxDescriptionLength,
            @Value("${netflix.genre-weight:18}") double genreWeight,
            @Value("${netflix.popularity-weight:1.0}") double popularityWeight,
            @Value("${netflix.recency-weight:6.0}") double recencyWeight
    ) {
        this.defaultLimit = defaultLimit;
        this.maxLimit = maxLimit;
        this.continueLimit = continueLimit;
        this.maxGenres = maxGenres;
        this.maxIdLength = maxIdLength;
        this.maxTitleLength = maxTitleLength;
        this.maxDescriptionLength = maxDescriptionLength;
        this.genreWeight = genreWeight;
        this.popularityWeight = popularityWeight;
        this.recencyWeight = recencyWeight;
        seed();
    }

    public int getDefaultLimit() {
        return defaultLimit;
    }

    public int getMaxLimit() {
        return maxLimit;
    }

    public int getContinueLimit() {
        return continueLimit;
    }

    public int getMaxGenres() {
        return maxGenres;
    }

    public List<CatalogItem> allCatalog() {
        return new ArrayList<>(catalog.values());
    }

    public List<Profile> allProfiles() {
        return new ArrayList<>(profiles.values());
    }

    public Profile getProfile(String profileId) {
        Profile profile = profiles.get(profileId);
        if (profile == null) {
            throw new IllegalArgumentException("Profile not found: " + profileId);
        }
        return profile;
    }

    public Profile resolveProfile(String profileId) {
        if (StringUtils.hasText(profileId) && profiles.containsKey(profileId)) {
            return profiles.get(profileId);
        }
        if (!profiles.isEmpty()) {
            return profiles.values().iterator().next();
        }
        Profile fallback = createProfile("Primary", List.of("Drama", "Thriller"), "TV-MA");
        return fallback;
    }

    public Profile createProfile(String name, List<String> favoriteGenres, String maturityLimit) {
        String resolvedName = requireText(name, "Profile name is required");
        String id = generateProfileId(resolvedName);
        String resolvedMaturity = normalizeMaturity(maturityLimit);
        List<String> resolvedGenres = normalizeGenres(favoriteGenres);
        Profile profile = new Profile(id, resolvedName, resolvedGenres, resolvedMaturity);
        profiles.put(id, profile);
        watchlists.put(id, new LinkedHashSet<>());
        progress.put(id, new LinkedHashMap<>());
        return profile;
    }

    public CatalogItem upsertCatalog(String id,
                                    String title,
                                    CatalogType type,
                                    int year,
                                    int durationMinutes,
                                    String maturityRating,
                                    List<String> genres,
                                    String description,
                                    Integer popularity) {
        String resolvedId = requireText(id, "Id is required");
        validateId(resolvedId);
        String resolvedTitle = requireText(title, "Title is required");
        if (resolvedTitle.length() > maxTitleLength) {
            throw new IllegalArgumentException("Title must be at most " + maxTitleLength + " characters");
        }
        if (type == null) {
            throw new IllegalArgumentException("Content type is required");
        }
        if (year < 1900 || year > Year.now().getValue() + 5) {
            throw new IllegalArgumentException("Release year looks invalid");
        }
        if (durationMinutes < 1 || durationMinutes > 1000) {
            throw new IllegalArgumentException("Duration must be between 1 and 1000 minutes");
        }
        String resolvedRating = requireText(maturityRating, "Maturity rating is required");
        List<String> resolvedGenres = normalizeGenres(genres);
        String resolvedDescription = description == null ? "" : description.trim();
        if (resolvedDescription.length() > maxDescriptionLength) {
            throw new IllegalArgumentException("Description must be at most " + maxDescriptionLength + " characters");
        }
        int resolvedPopularity = popularity == null ? 50 : Math.max(0, Math.min(100, popularity));

        CatalogItem existing = catalog.get(resolvedId);
        if (existing == null) {
            CatalogItem item = new CatalogItem(
                    resolvedId,
                    resolvedTitle,
                    type,
                    year,
                    durationMinutes,
                    resolvedRating,
                    resolvedGenres,
                    resolvedDescription,
                    resolvedPopularity
            );
            catalog.put(resolvedId, item);
            return item;
        }
        existing.update(
                resolvedTitle,
                type,
                year,
                durationMinutes,
                resolvedRating,
                resolvedGenres,
                resolvedDescription,
                resolvedPopularity
        );
        return existing;
    }

    public List<CatalogItem> trending(Integer limit) {
        int resolvedLimit = resolveLimit(limit);
        List<CatalogItem> items = new ArrayList<>(catalog.values());
        items.sort(Comparator
                .comparingLong(CatalogItem::getPlays).reversed()
                .thenComparingInt(CatalogItem::getPopularity).reversed()
                .thenComparing(CatalogItem::getUpdatedAt).reversed()
        );
        return items.subList(0, Math.min(resolvedLimit, items.size()));
    }

    public List<RecommendationEntry> recommendations(String profileId, Integer limit) {
        Profile profile = getProfile(profileId);
        int resolvedLimit = resolveLimit(limit);
        Set<String> favorite = toKeySet(profile.getFavoriteGenres());
        List<RecommendationEntry> scored = new ArrayList<>();
        for (CatalogItem item : catalog.values()) {
            if (!allowedByMaturity(profile, item)) {
                continue;
            }
            int matches = countGenreMatches(favorite, item.getGenres());
            double score = (item.getPopularity() * popularityWeight)
                    + (matches * genreWeight)
                    + recencyBoost(item.getYear());
            scored.add(new RecommendationEntry(item, score, matches));
        }
        scored.sort(Comparator
                .comparingDouble(RecommendationEntry::score).reversed()
                .thenComparing(entry -> entry.item().getPopularity(), Comparator.reverseOrder())
                .thenComparing(entry -> entry.item().getYear(), Comparator.reverseOrder())
        );
        return scored.subList(0, Math.min(resolvedLimit, scored.size()));
    }

    public List<ContinueWatchingEntry> continueWatching(String profileId, Integer limit) {
        Profile profile = getProfile(profileId);
        int resolvedLimit = limit == null ? continueLimit : Math.min(limit, continueLimit);
        Map<String, WatchProgress> profileProgress = progress.getOrDefault(profile.getId(), Map.of());
        List<ContinueWatchingEntry> entries = new ArrayList<>();
        for (WatchProgress watch : profileProgress.values()) {
            if (watch.isCompleted() || watch.getProgress() <= 0 || watch.getProgress() >= 100) {
                continue;
            }
            CatalogItem item = catalog.get(watch.getContentId());
            if (item != null) {
                entries.add(new ContinueWatchingEntry(item, watch));
            }
        }
        entries.sort(Comparator.comparing(entry -> entry.progress().getUpdatedAt(), Comparator.reverseOrder()));
        return entries.subList(0, Math.min(resolvedLimit, entries.size()));
    }

    public List<CatalogItem> watchlist(String profileId) {
        Profile profile = getProfile(profileId);
        Set<String> items = watchlists.getOrDefault(profile.getId(), Set.of());
        List<CatalogItem> result = new ArrayList<>();
        for (String itemId : items) {
            CatalogItem item = catalog.get(itemId);
            if (item != null) {
                result.add(item);
            }
        }
        return result;
    }

    public void updateWatchlist(String profileId, String contentId, boolean remove) {
        Profile profile = getProfile(profileId);
        CatalogItem item = catalog.get(contentId);
        if (item == null) {
            throw new IllegalArgumentException("Content not found: " + contentId);
        }
        Set<String> list = watchlists.computeIfAbsent(profile.getId(), key -> new LinkedHashSet<>());
        if (remove) {
            list.remove(contentId);
        } else {
            list.add(contentId);
        }
    }

    public WatchProgress recordPlayback(String profileId, String contentId, Integer progressValue, Boolean completed) {
        Profile profile = getProfile(profileId);
        CatalogItem item = catalog.get(contentId);
        if (item == null) {
            throw new IllegalArgumentException("Content not found: " + contentId);
        }
        int progressResolved = progressValue == null ? 0 : Math.max(0, Math.min(100, progressValue));
        boolean completedResolved = completed != null && completed;
        if (progressResolved >= 100) {
            progressResolved = 100;
            completedResolved = true;
        }
        Map<String, WatchProgress> profileProgress =
                this.progress.computeIfAbsent(profile.getId(), key -> new LinkedHashMap<>());
        WatchProgress watch = profileProgress.get(contentId);
        if (watch == null) {
            watch = new WatchProgress(contentId, progressResolved, completedResolved);
            profileProgress.put(contentId, watch);
            if (progressResolved > 0) {
                item.incrementPlays();
            }
        } else {
            if (watch.getProgress() == 0 && progressResolved > 0) {
                item.incrementPlays();
            }
            watch.update(progressResolved, completedResolved);
        }
        return watch;
    }

    public List<CatalogItem> search(String query, String genre) {
        String normalizedQuery = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        String normalizedGenre = genre == null ? "" : genre.trim().toLowerCase(Locale.ROOT);
        List<CatalogItem> results = new ArrayList<>();
        for (CatalogItem item : catalog.values()) {
            if (!normalizedQuery.isEmpty() && !item.getTitle().toLowerCase(Locale.ROOT).contains(normalizedQuery)) {
                continue;
            }
            if (!normalizedGenre.isEmpty() && !containsGenre(item.getGenres(), normalizedGenre)) {
                continue;
            }
            results.add(item);
        }
        return results;
    }

    public List<String> allGenres() {
        Map<String, String> unique = new LinkedHashMap<>();
        for (CatalogItem item : catalog.values()) {
            for (String genre : item.getGenres()) {
                String key = genre.toLowerCase(Locale.ROOT);
                if (!unique.containsKey(key)) {
                    unique.put(key, genre);
                }
            }
        }
        return new ArrayList<>(unique.values());
    }

    public List<WatchProgress> watchHistory(String profileId) {
        Profile profile = getProfile(profileId);
        Map<String, WatchProgress> history = progress.getOrDefault(profile.getId(), Map.of());
        return new ArrayList<>(history.values());
    }

    private int resolveLimit(Integer limit) {
        int resolvedLimit = limit == null ? defaultLimit : limit;
        if (resolvedLimit < 1 || resolvedLimit > maxLimit) {
            throw new IllegalArgumentException("Limit must be between 1 and " + maxLimit);
        }
        return resolvedLimit;
    }

    private String requireText(String value, String errorMessage) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(errorMessage);
        }
        return value.trim();
    }

    private void validateId(String id) {
        if (id.length() > maxIdLength) {
            throw new IllegalArgumentException("Id must be at most " + maxIdLength + " characters");
        }
        if (!id.matches("[A-Za-z0-9._:-]+")) {
            throw new IllegalArgumentException("Id can only contain letters, numbers, ., _, :, or -");
        }
    }

    private List<String> normalizeGenres(List<String> genres) {
        if (genres == null || genres.isEmpty()) {
            return List.of();
        }
        Map<String, String> normalized = new LinkedHashMap<>();
        for (String genre : genres) {
            if (!StringUtils.hasText(genre)) {
                continue;
            }
            String trimmed = genre.trim();
            String key = trimmed.toLowerCase(Locale.ROOT);
            normalized.putIfAbsent(key, trimmed);
            if (normalized.size() >= maxGenres) {
                break;
            }
        }
        return new ArrayList<>(normalized.values());
    }

    private Set<String> toKeySet(List<String> genres) {
        Set<String> result = new LinkedHashSet<>();
        for (String genre : genres) {
            result.add(genre.toLowerCase(Locale.ROOT));
        }
        return result;
    }

    private int countGenreMatches(Set<String> favorites, List<String> genres) {
        int matches = 0;
        for (String genre : genres) {
            if (favorites.contains(genre.toLowerCase(Locale.ROOT))) {
                matches++;
            }
        }
        return matches;
    }

    private boolean containsGenre(List<String> genres, String needle) {
        for (String genre : genres) {
            if (genre.toLowerCase(Locale.ROOT).contains(needle)) {
                return true;
            }
        }
        return false;
    }

    private double recencyBoost(int year) {
        int currentYear = Year.now().getValue();
        int delta = Math.max(0, currentYear - year);
        int freshness = Math.max(0, 6 - delta);
        return freshness * recencyWeight;
    }

    private boolean allowedByMaturity(Profile profile, CatalogItem item) {
        int profileRank = ratingRank(profile.getMaturityLimit());
        int itemRank = ratingRank(item.getMaturityRating());
        return itemRank <= profileRank;
    }

    private int ratingRank(String rating) {
        if (rating == null) {
            return 4;
        }
        return switch (rating.trim().toUpperCase(Locale.ROOT)) {
            case "G" -> 1;
            case "PG" -> 2;
            case "PG-13" -> 3;
            case "TV-14" -> 3;
            case "R" -> 4;
            case "TV-MA" -> 4;
            default -> 4;
        };
    }

    private String normalizeMaturity(String maturityLimit) {
        if (!StringUtils.hasText(maturityLimit)) {
            return "TV-MA";
        }
        return maturityLimit.trim().toUpperCase(Locale.ROOT);
    }

    private String generateProfileId(String name) {
        String base = name.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-");
        base = base.replaceAll("^-+|-+$", "");
        if (base.isEmpty()) {
            base = "profile";
        }
        String candidate = base;
        int suffix = 1;
        while (profiles.containsKey(candidate)) {
            candidate = base + "-" + suffix++;
        }
        return candidate;
    }

    private void seed() {
        upsertCatalog(
                "midnight-arcade",
                "Midnight Arcade",
                CatalogType.MOVIE,
                2024,
                118,
                "PG-13",
                List.of("Sci-Fi", "Action"),
                "An unlikely duo uncovers a hidden arcade that opens portals across the city.",
                92
        );
        upsertCatalog(
                "luna-coast",
                "Luna Coast",
                CatalogType.SERIES,
                2023,
                52,
                "TV-14",
                List.of("Drama", "Mystery"),
                "A coastal town covers its secrets as a journalist returns home.",
                85
        );
        upsertCatalog(
                "atlas-zero",
                "Atlas Zero",
                CatalogType.MOVIE,
                2022,
                132,
                "PG-13",
                List.of("Thriller", "Adventure"),
                "A rescue pilot races to stop a climate weapon hidden in the Arctic.",
                77
        );
        upsertCatalog(
                "paper-kites",
                "Paper Kites",
                CatalogType.SERIES,
                2021,
                46,
                "TV-14",
                List.of("Romance", "Comedy"),
                "A group of roommates starts a rooftop newsletter that goes viral.",
                70
        );
        upsertCatalog(
                "neon-noir",
                "Neon Noir",
                CatalogType.MOVIE,
                2020,
                109,
                "R",
                List.of("Crime", "Thriller"),
                "A detective follows a trail of art thieves through the city’s underground.",
                88
        );
        upsertCatalog(
                "aurora-falls",
                "Aurora Falls",
                CatalogType.SERIES,
                2024,
                58,
                "TV-MA",
                List.of("Fantasy", "Drama"),
                "The last skyship captain fights to save a city floating above storm clouds.",
                95
        );
        upsertCatalog(
                "stone-bridge",
                "Stone Bridge",
                CatalogType.MOVIE,
                2019,
                124,
                "PG",
                List.of("Family", "Adventure"),
                "Two siblings discover a hidden bridge that rewrites their town’s history.",
                63
        );
        upsertCatalog(
                "signal-nine",
                "Signal Nine",
                CatalogType.SERIES,
                2022,
                44,
                "TV-14",
                List.of("Sci-Fi", "Mystery"),
                "A satellite operator receives transmissions from the future.",
                82
        );

        createProfile("Avery", List.of("Sci-Fi", "Thriller", "Mystery"), "TV-MA");
        createProfile("Maya", List.of("Romance", "Comedy", "Family"), "PG-13");
        createProfile("Theo", List.of("Adventure", "Fantasy", "Drama"), "TV-14");
    }
}
