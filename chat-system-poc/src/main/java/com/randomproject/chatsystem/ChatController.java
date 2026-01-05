package com.randomproject.chatsystem;

import jakarta.validation.Valid;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.util.NoSuchElementException;

@Controller
public class ChatController {
    private final ChatRoomService chatRoomService;

    public ChatController(ChatRoomService chatRoomService) {
        this.chatRoomService = chatRoomService;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        model.addAttribute("rooms", chatRoomService.listRooms());
        model.addAttribute("createRoomRequest", new CreateRoomRequest());
        model.addAttribute("message", message);
        return "home";
    }

    @GetMapping("/rooms/{roomName}")
    public String room(@PathVariable String roomName,
                       @RequestParam(value = "message", required = false) String message,
                       Model model,
                       RedirectAttributes redirectAttributes) {
        return chatRoomService.findRoom(roomName)
                .map(room -> {
                    model.addAttribute("room", room);
                    model.addAttribute("messages", chatRoomService.messages(roomName));
                    model.addAttribute("message", message);
                    model.addAttribute("chatMessageRequest", new ChatMessageRequest());
                    model.addAttribute("maxMessages", chatRoomService.maxMessages());
                    return "room";
                })
                .orElseGet(() -> {
                    redirectAttributes.addAttribute("message", "Room not found: " + roomName);
                    return "redirect:/";
                });
    }

    @PostMapping("/rooms")
    public String createRoom(@Valid @ModelAttribute("createRoomRequest") CreateRoomRequest request,
                             BindingResult bindingResult,
                             RedirectAttributes redirectAttributes) {
        if (bindingResult.hasErrors()) {
            redirectAttributes.addAttribute("message", "Room name must be 3-40 characters.");
            return "redirect:/";
        }

        try {
            chatRoomService.createRoom(request.getName(), request.getTopic());
            String encoded = UriUtils.encodePathSegment(request.getName(), StandardCharsets.UTF_8);
            return "redirect:/rooms/" + encoded;
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
            return "redirect:/";
        }
    }

    @PostMapping("/rooms/{roomName}/message")
    public String postMessage(@PathVariable String roomName,
                              @Valid @ModelAttribute("chatMessageRequest") ChatMessageRequest request,
                              BindingResult bindingResult,
                              RedirectAttributes redirectAttributes) {
        String encoded = UriUtils.encodePathSegment(roomName, StandardCharsets.UTF_8);

        if (bindingResult.hasErrors()) {
            redirectAttributes.addAttribute("message", "Sender and message are required.");
            return "redirect:/rooms/" + encoded;
        }

        try {
            chatRoomService.postMessage(roomName, request.getSender(), request.getContent());
        } catch (IllegalArgumentException | NoSuchElementException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/rooms/" + encoded;
    }
}
