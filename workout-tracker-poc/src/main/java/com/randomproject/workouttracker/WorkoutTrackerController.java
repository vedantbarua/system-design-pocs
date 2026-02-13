package com.randomproject.workouttracker;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;

@RestController
@RequestMapping("/api")
public class WorkoutTrackerController {
    private final WorkoutTrackerService service;

    public WorkoutTrackerController(WorkoutTrackerService service) {
        this.service = service;
    }

    @PostMapping("/workouts")
    public WorkoutEntry addWorkout(@Valid @RequestBody WorkoutIngestRequest request) {
        Instant occurredAt = parseInstant(request.occurredAt());
        if (occurredAt == null) {
            occurredAt = Instant.now();
        }
        return service.addWorkout(request, occurredAt);
    }

    @GetMapping("/workouts")
    public List<WorkoutEntry> listWorkouts(@RequestParam(required = false) String from,
                                           @RequestParam(required = false) String to) {
        return service.listWorkouts(parseInstant(from), parseInstant(to));
    }

    @DeleteMapping("/workouts/{id}")
    public void deleteWorkout(@PathVariable long id) {
        service.deleteWorkout(id);
    }

    @PostMapping("/workouts/seed")
    public List<WorkoutEntry> seedWorkouts(@RequestParam(defaultValue = "8") int count) {
        if (count <= 0 || count > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "count must be between 1 and 200");
        }
        return service.seedWorkouts(count);
    }

    @PostMapping("/meals")
    public MealEntry addMeal(@Valid @RequestBody MealIngestRequest request) {
        Instant occurredAt = parseInstant(request.occurredAt());
        if (occurredAt == null) {
            occurredAt = Instant.now();
        }
        return service.addMeal(request, occurredAt);
    }

    @GetMapping("/meals")
    public List<MealEntry> listMeals(@RequestParam(required = false) String from,
                                     @RequestParam(required = false) String to) {
        return service.listMeals(parseInstant(from), parseInstant(to));
    }

    @DeleteMapping("/meals/{id}")
    public void deleteMeal(@PathVariable long id) {
        service.deleteMeal(id);
    }

    @PostMapping("/meals/seed")
    public List<MealEntry> seedMeals(@RequestParam(defaultValue = "8") int count) {
        if (count <= 0 || count > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "count must be between 1 and 200");
        }
        return service.seedMeals(count);
    }

    @GetMapping("/overview")
    public CalorieOverview overview(@RequestParam(required = false) String from,
                                    @RequestParam(required = false) String to) {
        return service.overview(parseInstant(from), parseInstant(to));
    }

    private Instant parseInstant(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Instant.parse(raw);
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid timestamp. Use ISO-8601 like 2026-02-01T10:15:30Z");
        }
    }
}
