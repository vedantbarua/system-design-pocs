package com.randomproject.antientropyrepair;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;
import org.springframework.web.servlet.mvc.support.RedirectAttributes;

import java.util.Map;

@Controller
public class AntiEntropyRepairController {
    private final AntiEntropyRepairService service;

    public AntiEntropyRepairController(AntiEntropyRepairService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("snapshot", service.snapshot());
        model.addAttribute("modes", ReplicaMode.values());
        return "index";
    }

    @GetMapping("/api/snapshot")
    @ResponseBody
    public SystemSnapshot snapshot() {
        return service.snapshot();
    }

    @PostMapping("/api/write")
    @ResponseBody
    public CommandResult write(@Valid @RequestBody WriteRequest request) {
        return service.write(request);
    }

    @PostMapping("/api/replicas/corrupt")
    @ResponseBody
    public CommandResult corrupt(@Valid @RequestBody CorruptRequest request) {
        return service.corrupt(request);
    }

    @PostMapping("/api/replicas/delete-key")
    @ResponseBody
    public CommandResult deleteReplicaKey(@Valid @RequestBody DeleteReplicaKeyRequest request) {
        return service.deleteReplicaKey(request);
    }

    @PostMapping("/api/replicas/mode")
    @ResponseBody
    public CommandResult setReplicaMode(@Valid @RequestBody ReplicaModeRequest request) {
        return service.setReplicaMode(request);
    }

    @PostMapping("/api/anti-entropy/compare")
    @ResponseBody
    public CommandResult compare() {
        return service.compare();
    }

    @PostMapping("/api/anti-entropy/repair")
    @ResponseBody
    public RepairResult repair(@Valid @RequestBody RepairRequest request) {
        return service.repair(request);
    }

    @PostMapping("/ui/write")
    public String writeFromUi(
            @RequestParam String key,
            @RequestParam String value,
            @RequestParam(required = false) String skipReplicaId,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.write(new WriteRequest(key, value, skipReplicaId));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/replicas/corrupt")
    public String corruptFromUi(
            @RequestParam String replicaId,
            @RequestParam String key,
            @RequestParam String value,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.corrupt(new CorruptRequest(replicaId, key, value));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/replicas/delete-key")
    public String deleteReplicaKeyFromUi(
            @RequestParam String replicaId,
            @RequestParam String key,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.deleteReplicaKey(new DeleteReplicaKeyRequest(replicaId, key));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/replicas/mode")
    public String setReplicaModeFromUi(
            @RequestParam String replicaId,
            @RequestParam ReplicaMode mode,
            RedirectAttributes redirectAttributes) {
        CommandResult result = service.setReplicaMode(new ReplicaModeRequest(replicaId, mode));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/anti-entropy/compare")
    public String compareFromUi(RedirectAttributes redirectAttributes) {
        CommandResult result = service.compare();
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @PostMapping("/ui/anti-entropy/repair")
    public String repairFromUi(
            @RequestParam(required = false) String sourceReplicaId,
            @RequestParam(required = false) String targetReplicaId,
            @RequestParam(required = false) String rangeStart,
            @RequestParam(required = false) String rangeEnd,
            RedirectAttributes redirectAttributes) {
        RepairResult result = service.repair(new RepairRequest(sourceReplicaId, targetReplicaId, rangeStart, rangeEnd));
        redirectAttributes.addFlashAttribute("message", result.message());
        return "redirect:/";
    }

    @ExceptionHandler(IllegalArgumentException.class)
    @ResponseBody
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }
}
