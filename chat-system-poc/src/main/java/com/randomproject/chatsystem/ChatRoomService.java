package com.randomproject.chatsystem;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class ChatRoomService {
    private final int maxMessages;
    private final Map<String, RoomState> rooms = new ConcurrentHashMap<>();

    public ChatRoomService(@Value("${app.max-messages:200}") int maxMessages) {
        this.maxMessages = maxMessages;
        createRoom("general", "Default lounge everyone joins first.");
    }

    public List<ChatRoom> listRooms() {
        return rooms.values().stream()
                .map(RoomState::room)
                .sorted(Comparator.comparing(ChatRoom::getCreatedAt))
                .toList();
    }

    public ChatRoom createRoom(String rawName, String rawTopic) {
        String name = normalizeName(rawName);
        if (name.length() < 3) {
            throw new IllegalArgumentException("Room name must be at least 3 characters.");
        }

        String topic = normalizeTopic(rawTopic);
        String key = toKey(name);
        if (rooms.containsKey(key)) {
            throw new IllegalArgumentException("Room already exists: " + name);
        }

        ChatRoom room = new ChatRoom(name, topic, LocalDateTime.now());
        rooms.put(key, new RoomState(room));
        return room;
    }

    public Optional<ChatRoom> findRoom(String rawName) {
        String key = toKey(normalizeName(rawName));
        return Optional.ofNullable(rooms.get(key)).map(RoomState::room);
    }

    public List<ChatMessage> messages(String rawName) {
        RoomState state = roomState(rawName);
        synchronized (state) {
            return new ArrayList<>(state.messages);
        }
    }

    public ChatMessage postMessage(String rawName, String rawSender, String rawContent) {
        RoomState state = roomState(rawName);
        String sender = normalizeSender(rawSender);
        String content = normalizeContent(rawContent);
        ChatMessage message = new ChatMessage(sender, content, LocalDateTime.now());

        synchronized (state) {
            state.messages.addLast(message);
            while (state.messages.size() > maxMessages) {
                state.messages.removeFirst();
            }
        }
        return message;
    }

    public int maxMessages() {
        return maxMessages;
    }

    private RoomState roomState(String rawName) {
        String key = toKey(normalizeName(rawName));
        RoomState state = rooms.get(key);
        if (state == null) {
            throw new NoSuchElementException("Room not found: " + rawName);
        }
        return state;
    }

    private String normalizeName(String raw) {
        return raw == null ? "" : raw.trim();
    }

    private String normalizeTopic(String raw) {
        return raw == null ? "" : raw.trim();
    }

    private String normalizeSender(String raw) {
        String sender = raw == null ? "Guest" : raw.trim();
        return sender.isEmpty() ? "Guest" : sender;
    }

    private String normalizeContent(String raw) {
        String content = raw == null ? "" : raw.trim();
        if (content.isEmpty()) {
            throw new IllegalArgumentException("Message content cannot be empty.");
        }
        return content;
    }

    private String toKey(String name) {
        return name.toLowerCase();
    }

    private static class RoomState {
        private final ChatRoom room;
        private final Deque<ChatMessage> messages = new ArrayDeque<>();

        RoomState(ChatRoom room) {
            this.room = room;
        }

        ChatRoom room() {
            return room;
        }
    }
}
