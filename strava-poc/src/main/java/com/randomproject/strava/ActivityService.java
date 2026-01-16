package com.randomproject.strava;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.stereotype.Service;

@Service
public class ActivityService {
    private final Map<Long, Activity> activities = new ConcurrentHashMap<>();
    private final AtomicLong idSequence = new AtomicLong(1000);

    public ActivityService() {
        seedActivities();
    }

    public List<Activity> listActivities() {
        List<Activity> result = new ArrayList<>(activities.values());
        result.sort(Comparator.comparing(Activity::getStartedAt).reversed()
                .thenComparing(Activity::getId, Comparator.reverseOrder()));
        return result;
    }

    public Activity getActivity(long id) {
        return activities.get(id);
    }

    public Activity createActivity(ActivityForm form) {
        long id = idSequence.incrementAndGet();
        Activity activity = new Activity(
                id,
                form.getAthleteName(),
                form.getType(),
                form.getDistanceKm(),
                form.getDurationMinutes(),
                form.getStartedAt(),
                nullIfBlank(form.getLocation()),
                nullIfBlank(form.getDescription())
        );
        activities.put(id, activity);
        return activity;
    }

    public ActivitySummary getSummary() {
        int count = activities.size();
        double totalDistance = activities.values().stream()
                .mapToDouble(Activity::getDistanceKm)
                .sum();
        int totalDuration = activities.values().stream()
                .mapToInt(Activity::getDurationMinutes)
                .sum();
        double averagePace = totalDistance > 0 ? totalDuration / totalDistance : 0;
        return new ActivitySummary(count, totalDistance, totalDuration, averagePace);
    }

    private void seedActivities() {
        createSeedActivity("Maya Patel", ActivityType.RUN, 6.2, 34,
                LocalDateTime.now().minusDays(1).withHour(6).withMinute(30),
                "Lakefront Loop", "Intervals with a strong finish");
        createSeedActivity("Arjun Rao", ActivityType.RIDE, 24.5, 72,
                LocalDateTime.now().minusDays(2).withHour(7).withMinute(15),
                "Hillside Circuit", "Rolling climbs and a fast descent");
        createSeedActivity("Priya Singh", ActivityType.SWIM, 1.5, 40,
                LocalDateTime.now().minusHours(10).withMinute(0),
                "Community Pool", "Steady endurance set");
    }

    private void createSeedActivity(String athlete,
                                    ActivityType type,
                                    double distanceKm,
                                    int durationMinutes,
                                    LocalDateTime startedAt,
                                    String location,
                                    String description) {
        long id = idSequence.incrementAndGet();
        Activity activity = new Activity(id, athlete, type, distanceKm, durationMinutes,
                startedAt, location, description);
        activities.put(id, activity);
    }

    private String nullIfBlank(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
