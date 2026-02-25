package com.randomproject.flashconf;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

public class AuditLog {
    private final int maxEntries;
    private final Deque<ChangeLogEntry> entries = new ArrayDeque<>();

    public AuditLog(int maxEntries) {
        this.maxEntries = maxEntries;
    }

    public synchronized void add(ChangeLogEntry entry) {
        entries.addFirst(entry);
        while (entries.size() > maxEntries) {
            entries.removeLast();
        }
    }

    public synchronized List<ChangeLogEntry> list() {
        return new ArrayList<>(entries);
    }
}
