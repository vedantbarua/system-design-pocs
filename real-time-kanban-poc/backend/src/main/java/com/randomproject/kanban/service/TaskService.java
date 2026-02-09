package com.randomproject.kanban.service;

import com.randomproject.kanban.model.BoardSnapshot;
import com.randomproject.kanban.model.Task;
import com.randomproject.kanban.model.TaskStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class TaskService {
    private final Map<String, Task> tasks = new LinkedHashMap<>();

    public TaskService() {
        seed();
    }

    public synchronized List<Task> list() {
        List<Task> result = new ArrayList<>(tasks.values());
        result.sort(Comparator.comparing(Task::getUpdatedAt).reversed());
        return result;
    }

    public synchronized Task create(String title, String description) {
        Instant now = Instant.now();
        String id = UUID.randomUUID().toString();
        Task task = new Task(id, title, description, TaskStatus.TODO, now);
        tasks.put(id, task);
        return task;
    }

    public synchronized Optional<Task> update(String id, String title, String description) {
        Task existing = tasks.get(id);
        if (existing == null) {
            return Optional.empty();
        }
        existing.setTitle(title);
        existing.setDescription(description);
        existing.setUpdatedAt(Instant.now());
        return Optional.of(existing);
    }

    public synchronized Optional<Task> move(String id, TaskStatus status) {
        Task existing = tasks.get(id);
        if (existing == null) {
            return Optional.empty();
        }
        existing.setStatus(status);
        existing.setUpdatedAt(Instant.now());
        return Optional.of(existing);
    }

    public synchronized boolean delete(String id) {
        return tasks.remove(id) != null;
    }

    public synchronized BoardSnapshot snapshot() {
        return new BoardSnapshot(list(), Instant.now());
    }

    private void seed() {
        Task t1 = new Task(UUID.randomUUID().toString(), "Draft onboarding flow",
                "Align with product on checkpoints", TaskStatus.TODO, Instant.now());
        Task t2 = new Task(UUID.randomUUID().toString(), "Instrument event tracking",
                "Capture task.created and task.moved", TaskStatus.IN_PROGRESS, Instant.now());
        Task t3 = new Task(UUID.randomUUID().toString(), "Launch internal demo",
                "Invite design + eng leads", TaskStatus.DONE, Instant.now());
        tasks.put(t1.getId(), t1);
        tasks.put(t2.getId(), t2);
        tasks.put(t3.getId(), t3);
    }
}
