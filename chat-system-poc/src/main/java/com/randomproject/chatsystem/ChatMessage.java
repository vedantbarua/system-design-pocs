package com.randomproject.chatsystem;

import java.time.LocalDateTime;

public class ChatMessage {
    private final String sender;
    private final String content;
    private final LocalDateTime sentAt;

    public ChatMessage(String sender, String content, LocalDateTime sentAt) {
        this.sender = sender;
        this.content = content;
        this.sentAt = sentAt;
    }

    public String getSender() {
        return sender;
    }

    public String getContent() {
        return content;
    }

    public LocalDateTime getSentAt() {
        return sentAt;
    }
}
