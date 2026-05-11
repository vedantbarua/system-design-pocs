package com.randomproject.writeaheadlog;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.Map;

@Controller
public class WriteAheadLogController {
    private final WriteAheadLogService service;

    public WriteAheadLogController(WriteAheadLogService service) {
        this.service = service;
    }

    @GetMapping("/")
    public String home(Model model) {
        model.addAttribute("snapshot", service.snapshot());
        model.addAttribute("putRequest", new PutRequest("cmd-" + System.currentTimeMillis(), "feature:status", "enabled"));
        model.addAttribute("deleteRequest", new DeleteRequest("cmd-" + (System.currentTimeMillis() + 1), "feature:status"));
        return "index";
    }

    @PostMapping("/put")
    public String putFromForm(@Valid @ModelAttribute PutRequest request, BindingResult bindingResult, Model model) {
        if (!bindingResult.hasErrors()) {
            service.put(request.commandId(), request.key(), request.value());
        }
        return home(model);
    }

    @PostMapping("/delete")
    public String deleteFromForm(@Valid @ModelAttribute DeleteRequest request, BindingResult bindingResult, Model model) {
        if (!bindingResult.hasErrors()) {
            service.delete(request.commandId(), request.key());
        }
        return home(model);
    }

    @PostMapping("/checkpoint")
    public String checkpointFromForm() {
        service.createCheckpoint();
        return "redirect:/";
    }

    @PostMapping("/recover")
    public String recoverFromForm() {
        service.simulateCrashAndRecover();
        return "redirect:/";
    }

    @PostMapping("/compact")
    public String compactFromForm() {
        service.compactLog();
        return "redirect:/";
    }

    @GetMapping("/api/state")
    @ResponseBody
    public WalSnapshot snapshot() {
        return service.snapshot();
    }

    @PostMapping("/api/entries")
    @ResponseBody
    public ApplyResult put(@Valid @RequestBody PutRequest request) {
        return service.put(request.commandId(), request.key(), request.value());
    }

    @DeleteMapping("/api/entries")
    @ResponseBody
    public ApplyResult delete(@Valid @RequestBody DeleteRequest request) {
        return service.delete(request.commandId(), request.key());
    }

    @PostMapping("/api/checkpoint")
    @ResponseBody
    public CheckpointView checkpoint() {
        return service.createCheckpoint();
    }

    @PostMapping("/api/recover")
    @ResponseBody
    public RecoveryResult recover() {
        return service.simulateCrashAndRecover();
    }

    @PostMapping("/api/compact")
    @ResponseBody
    public WalSnapshot compact() {
        return service.compactLog();
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    @ResponseBody
    public ResponseEntity<Map<String, String>> handleBadRequest(RuntimeException exception) {
        return ResponseEntity.badRequest().body(Map.of("error", exception.getMessage()));
    }
}
