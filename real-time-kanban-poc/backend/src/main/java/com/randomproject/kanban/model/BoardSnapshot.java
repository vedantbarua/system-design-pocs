package com.randomproject.kanban.model;

import java.time.Instant;
import java.util.List;

public class BoardSnapshot {
    private List<Task> tasks;
    private Instant lastUpdated;

    public BoardSnapshot() {
    }

    public BoardSnapshot(List<Task> tasks, Instant lastUpdated) {
        this.tasks = tasks;
        this.lastUpdated = lastUpdated;
    }

    public List<Task> getTasks() {
        return tasks;
    }

    public void setTasks(List<Task> tasks) {
        this.tasks = tasks;
    }

    public Instant getLastUpdated() {
        return lastUpdated;
    }

    public void setLastUpdated(Instant lastUpdated) {
        this.lastUpdated = lastUpdated;
    }
}
