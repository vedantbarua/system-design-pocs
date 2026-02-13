package com.randomproject.workouttracker;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;

@Service
public class WorkoutTrackerService {
    private final Map<Long, WorkoutEntry> workouts = new ConcurrentHashMap<>();
    private final Map<Long, MealEntry> meals = new ConcurrentHashMap<>();
    private final AtomicLong workoutSeq = new AtomicLong(1000);
    private final AtomicLong mealSeq = new AtomicLong(5000);
    private final Random random = new Random();

    public WorkoutEntry addWorkout(WorkoutIngestRequest request, Instant occurredAt) {
        long id = workoutSeq.incrementAndGet();
        WorkoutEntry entry = new WorkoutEntry(
                id,
                request.name().trim(),
                request.category().trim(),
                request.durationMinutes(),
                request.caloriesBurned(),
                occurredAt
        );
        workouts.put(id, entry);
        return entry;
    }

    public MealEntry addMeal(MealIngestRequest request, Instant occurredAt) {
        long id = mealSeq.incrementAndGet();
        MealEntry entry = new MealEntry(
                id,
                request.name().trim(),
                request.mealType().trim(),
                request.calories(),
                occurredAt
        );
        meals.put(id, entry);
        return entry;
    }

    public List<WorkoutEntry> listWorkouts(Instant from, Instant to) {
        return workouts.values().stream()
                .filter(entry -> withinRange(entry.occurredAt(), from, to))
                .sorted(Comparator.comparing(WorkoutEntry::occurredAt).reversed())
                .collect(Collectors.toList());
    }

    public List<MealEntry> listMeals(Instant from, Instant to) {
        return meals.values().stream()
                .filter(entry -> withinRange(entry.occurredAt(), from, to))
                .sorted(Comparator.comparing(MealEntry::occurredAt).reversed())
                .collect(Collectors.toList());
    }

    public void deleteWorkout(long id) {
        workouts.remove(id);
    }

    public void deleteMeal(long id) {
        meals.remove(id);
    }

    public CalorieOverview overview(Instant from, Instant to) {
        List<WorkoutEntry> workoutEntries = listWorkouts(from, to);
        List<MealEntry> mealEntries = listMeals(from, to);

        int workoutMinutes = workoutEntries.stream().mapToInt(WorkoutEntry::durationMinutes).sum();
        int burned = workoutEntries.stream().mapToInt(WorkoutEntry::caloriesBurned).sum();
        int consumed = mealEntries.stream().mapToInt(MealEntry::calories).sum();

        return new CalorieOverview(
                workoutEntries.size(),
                mealEntries.size(),
                workoutMinutes,
                burned,
                consumed,
                consumed - burned
        );
    }

    public List<WorkoutEntry> seedWorkouts(int count) {
        List<WorkoutEntry> entries = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            String[] names = {"Tempo Run", "Strength Circuit", "Yoga Flow", "Cycling", "HIIT", "Swim Laps"};
            String[] categories = {"Cardio", "Strength", "Mobility", "Endurance"};
            String name = names[random.nextInt(names.length)];
            String category = categories[random.nextInt(categories.length)];
            int minutes = 20 + random.nextInt(55);
            int calories = 140 + random.nextInt(420);
            Instant when = Instant.now().minus(random.nextInt(7 * 24), ChronoUnit.HOURS);
            WorkoutIngestRequest request = new WorkoutIngestRequest(name, category, minutes, calories, when.toString());
            entries.add(addWorkout(request, when));
        }
        return entries;
    }

    public List<MealEntry> seedMeals(int count) {
        List<MealEntry> entries = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            String[] mealsOptions = {"Overnight Oats", "Chicken Bowl", "Salmon Plate", "Protein Shake", "Veggie Wrap", "Greek Yogurt"};
            String[] mealTypes = {"Breakfast", "Lunch", "Dinner", "Snack"};
            String name = mealsOptions[random.nextInt(mealsOptions.length)];
            String mealType = mealTypes[random.nextInt(mealTypes.length)];
            int calories = 180 + random.nextInt(520);
            Instant when = Instant.now().minus(random.nextInt(7 * 24), ChronoUnit.HOURS);
            MealIngestRequest request = new MealIngestRequest(name, mealType, calories, when.toString());
            entries.add(addMeal(request, when));
        }
        return entries;
    }

    private boolean withinRange(Instant occurredAt, Instant from, Instant to) {
        if (occurredAt == null) {
            return false;
        }
        boolean afterFrom = from == null || !occurredAt.isBefore(from);
        boolean beforeTo = to == null || !occurredAt.isAfter(to);
        return afterFrom && beforeTo;
    }
}
