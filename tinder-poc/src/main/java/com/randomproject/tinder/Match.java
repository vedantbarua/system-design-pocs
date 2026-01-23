package com.randomproject.tinder;

import java.time.Duration;
import java.time.LocalDateTime;

public class Match {
    private final long id;
    private final Profile profile;
    private final LocalDateTime matchedAt;
    private final String lastMessage;

    public Match(long id, Profile profile, LocalDateTime matchedAt, String lastMessage) {
        this.id = id;
        this.profile = profile;
        this.matchedAt = matchedAt;
        this.lastMessage = lastMessage;
    }

    public long getId() {
        return id;
    }

    public Profile getProfile() {
        return profile;
    }

    public LocalDateTime getMatchedAt() {
        return matchedAt;
    }

    public String getLastMessage() {
        return lastMessage;
    }

    public String getMatchedLabel() {
        Duration duration = Duration.between(matchedAt, LocalDateTime.now());
        long minutes = duration.toMinutes();
        if (minutes < 60) {
            return "Matched " + Math.max(1, minutes) + "m ago";
        }
        long hours = minutes / 60;
        if (hours < 24) {
            return "Matched " + hours + "h ago";
        }
        long days = hours / 24;
        return "Matched " + days + "d ago";
    }
}
