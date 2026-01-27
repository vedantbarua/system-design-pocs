package com.randomproject.netflix;

import java.time.Instant;

public class WatchProgress {
    private final String contentId;
    private int progress;
    private boolean completed;
    private final Instant startedAt;
    private Instant updatedAt;

    public WatchProgress(String contentId, int progress, boolean completed) {
        this.contentId = contentId;
        this.progress = progress;
        this.completed = completed;
        this.startedAt = Instant.now();
        this.updatedAt = this.startedAt;
    }

    public String getContentId() {
        return contentId;
    }

    public int getProgress() {
        return progress;
    }

    public boolean isCompleted() {
        return completed;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public void update(int progress, boolean completed) {
        this.progress = progress;
        this.completed = completed;
        this.updatedAt = Instant.now();
    }
}
