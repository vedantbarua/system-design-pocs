package com.randomproject.netflix;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class Profile {
    private final String id;
    private final String name;
    private final List<String> favoriteGenres;
    private final String maturityLimit;
    private final Instant createdAt;

    public Profile(String id, String name, List<String> favoriteGenres, String maturityLimit) {
        this.id = id;
        this.name = name;
        this.favoriteGenres = new ArrayList<>(favoriteGenres);
        this.maturityLimit = maturityLimit;
        this.createdAt = Instant.now();
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public List<String> getFavoriteGenres() {
        return Collections.unmodifiableList(favoriteGenres);
    }

    public String getMaturityLimit() {
        return maturityLimit;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
