package com.randomproject.chatsystem;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.NoSuchElementException;

@RestController
@RequestMapping("/api")
public class ChatApiController {
    private final ChatRoomService chatRoomService;

    public ChatApiController(ChatRoomService chatRoomService) {
        this.chatRoomService = chatRoomService;
    }

    @GetMapping("/rooms")
    public List<ChatRoom> rooms() {
        return chatRoomService.listRooms();
    }

    @GetMapping("/rooms/{roomName}")
    public ResponseEntity<ChatRoom> room(@PathVariable String roomName) {
        return chatRoomService.findRoom(roomName)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/rooms/{roomName}/messages")
    public ResponseEntity<List<ChatMessage>> messages(@PathVariable String roomName) {
        try {
            return ResponseEntity.ok(chatRoomService.messages(roomName));
        } catch (NoSuchElementException ex) {
            return ResponseEntity.notFound().build();
        }
    }

    @PostMapping("/rooms")
    public ResponseEntity<ChatRoom> createRoom(@Valid @RequestBody CreateRoomRequest request) {
        try {
            ChatRoom room = chatRoomService.createRoom(request.getName(), request.getTopic());
            return ResponseEntity.status(201).body(room);
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @PostMapping("/rooms/{roomName}/messages")
    public ResponseEntity<ChatMessage> postMessage(@PathVariable String roomName,
                                                   @Valid @RequestBody ChatMessageRequest request) {
        try {
            ChatMessage message = chatRoomService.postMessage(roomName, request.getSender(), request.getContent());
            return ResponseEntity.status(201).body(message);
        } catch (NoSuchElementException ex) {
            return ResponseEntity.notFound().build();
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }
}
