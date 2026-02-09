package com.randomproject.kanban.controller;

import com.randomproject.kanban.model.BoardSnapshot;
import com.randomproject.kanban.model.CreateTaskRequest;
import com.randomproject.kanban.model.MoveTaskRequest;
import com.randomproject.kanban.model.Task;
import com.randomproject.kanban.model.UpdateTaskRequest;
import com.randomproject.kanban.service.TaskService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class TaskController {
    private final TaskService taskService;
    private final SimpMessagingTemplate messagingTemplate;

    public TaskController(TaskService taskService, SimpMessagingTemplate messagingTemplate) {
        this.taskService = taskService;
        this.messagingTemplate = messagingTemplate;
    }

    @GetMapping("/tasks")
    public List<Task> listTasks() {
        return taskService.list();
    }

    @GetMapping("/board")
    public BoardSnapshot board() {
        return taskService.snapshot();
    }

    @PostMapping("/tasks")
    public ResponseEntity<Task> create(@Valid @RequestBody CreateTaskRequest request) {
        Task task = taskService.create(request.getTitle(), request.getDescription());
        broadcast();
        return ResponseEntity.status(HttpStatus.CREATED).body(task);
    }

    @PutMapping("/tasks/{id}")
    public ResponseEntity<Task> update(@PathVariable String id, @Valid @RequestBody UpdateTaskRequest request) {
        return taskService.update(id, request.getTitle(), request.getDescription())
                .map(task -> {
                    broadcast();
                    return ResponseEntity.ok(task);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/tasks/{id}/move")
    public ResponseEntity<Task> move(@PathVariable String id, @Valid @RequestBody MoveTaskRequest request) {
        return taskService.move(id, request.getStatus())
                .map(task -> {
                    broadcast();
                    return ResponseEntity.ok(task);
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/tasks/{id}")
    public ResponseEntity<Void> delete(@PathVariable String id) {
        boolean removed = taskService.delete(id);
        if (!removed) {
            return ResponseEntity.notFound().build();
        }
        broadcast();
        return ResponseEntity.noContent().build();
    }

    private void broadcast() {
        messagingTemplate.convertAndSend("/topic/board", taskService.snapshot());
    }
}
