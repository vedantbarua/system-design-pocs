package com.randomproject.chatsystem;

import java.time.LocalDateTime;

public class ChatRoom {
    private final String name;
    private final String topic;
    private final LocalDateTime createdAt;

    public ChatRoom(String name, String topic, LocalDateTime createdAt) {
        this.name = name;
        this.topic = topic;
        this.createdAt = createdAt;
    }

    public String getName() {
        return name;
    }

    public String getTopic() {
        return topic;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
