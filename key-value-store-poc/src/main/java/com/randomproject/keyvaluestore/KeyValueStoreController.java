package com.randomproject.keyvaluestore;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.Comparator;
import java.util.List;

@Controller
public class KeyValueStoreController {
    private final KeyValueStoreService service;

    public KeyValueStoreController(KeyValueStoreService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(@RequestParam(value = "message", required = false) String message, Model model) {
        model.addAttribute("entries", sortedEntries());
        model.addAttribute("message", message);
        return "index";
    }

    @PostMapping("/kv")
    public String putEntry(@RequestParam("key") String key,
                           @RequestParam("value") String value,
                           @RequestParam(value = "ttlSeconds", required = false) Integer ttlSeconds,
                           RedirectAttributes redirectAttributes) {
        try {
            KeyValueEntry entry = service.put(key, value, ttlSeconds);
            redirectAttributes.addAttribute("message", "Stored key: " + entry.getKey());
        } catch (IllegalArgumentException ex) {
            redirectAttributes.addAttribute("message", ex.getMessage());
        }
        return "redirect:/";
    }

    @PostMapping("/kv/{key}/delete")
    public String deleteEntry(@PathVariable String key, RedirectAttributes redirectAttributes) {
        boolean removed = service.delete(key);
        redirectAttributes.addAttribute("message", removed ? "Deleted key: " + key : "Key not found: " + key);
        return "redirect:/";
    }

    @PostMapping("/api/entries")
    @ResponseBody
    public ResponseEntity<KeyValueResponse> apiPut(@Valid @RequestBody KeyValuePutRequest request) {
        try {
            KeyValueEntry entry = service.put(request.key(), request.value(), request.ttlSeconds());
            return ResponseEntity.status(201).body(toResponse(entry));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().build();
        }
    }

    @GetMapping("/api/entries")
    @ResponseBody
    public List<KeyValueResponse> apiEntries() {
        return sortedEntries().stream().map(this::toResponse).toList();
    }

    @GetMapping("/api/entries/{key}")
    @ResponseBody
    public ResponseEntity<KeyValueResponse> apiEntry(@PathVariable String key) {
        return service.get(key)
                .map(entry -> ResponseEntity.ok(toResponse(entry)))
                .orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/api/entries/{key}")
    @ResponseBody
    public ResponseEntity<Void> apiDelete(@PathVariable String key) {
        boolean removed = service.delete(key);
        return removed ? ResponseEntity.noContent().build() : ResponseEntity.notFound().build();
    }

    private List<KeyValueEntry> sortedEntries() {
        return service.all().stream()
                .sorted(Comparator.comparing(KeyValueEntry::getUpdatedAt).reversed())
                .toList();
    }

    private KeyValueResponse toResponse(KeyValueEntry entry) {
        return new KeyValueResponse(
                entry.getKey(),
                entry.getValue(),
                entry.getCreatedAt(),
                entry.getUpdatedAt(),
                entry.getExpiresAt());
    }
}
