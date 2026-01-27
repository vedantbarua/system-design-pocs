package com.randomproject.netflix;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class CatalogItem {
    private final String id;
    private String title;
    private CatalogType type;
    private int year;
    private int durationMinutes;
    private String maturityRating;
    private List<String> genres;
    private String description;
    private int popularity;
    private long plays;
    private final Instant createdAt;
    private Instant updatedAt;

    public CatalogItem(String id,
                       String title,
                       CatalogType type,
                       int year,
                       int durationMinutes,
                       String maturityRating,
                       List<String> genres,
                       String description,
                       int popularity) {
        this.id = id;
        this.title = title;
        this.type = type;
        this.year = year;
        this.durationMinutes = durationMinutes;
        this.maturityRating = maturityRating;
        this.genres = new ArrayList<>(genres);
        this.description = description;
        this.popularity = popularity;
        this.plays = 0L;
        this.createdAt = Instant.now();
        this.updatedAt = this.createdAt;
    }

    public String getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public CatalogType getType() {
        return type;
    }

    public int getYear() {
        return year;
    }

    public int getDurationMinutes() {
        return durationMinutes;
    }

    public String getMaturityRating() {
        return maturityRating;
    }

    public List<String> getGenres() {
        return Collections.unmodifiableList(genres);
    }

    public String getDescription() {
        return description;
    }

    public int getPopularity() {
        return popularity;
    }

    public long getPlays() {
        return plays;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(String title,
                       CatalogType type,
                       int year,
                       int durationMinutes,
                       String maturityRating,
                       List<String> genres,
                       String description,
                       int popularity) {
        this.title = title;
        this.type = type;
        this.year = year;
        this.durationMinutes = durationMinutes;
        this.maturityRating = maturityRating;
        this.genres = new ArrayList<>(genres);
        this.description = description;
        this.popularity = popularity;
        this.updatedAt = Instant.now();
    }

    public void incrementPlays() {
        this.plays += 1;
        this.updatedAt = Instant.now();
    }
}
