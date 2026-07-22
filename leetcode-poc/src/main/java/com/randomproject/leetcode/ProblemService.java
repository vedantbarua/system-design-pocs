package com.randomproject.leetcode;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class ProblemService {
    private final Map<Long, Problem> problems = new LinkedHashMap<>();
    private final AtomicLong idGenerator = new AtomicLong(100);
    private final AtomicLong attemptIdGenerator = new AtomicLong(1000);

    public ProblemService() {
        seedData();
    }

    public synchronized List<Problem> listProblems(ProblemStatus status, Difficulty difficulty, String tag) {
        String normalizedTag = normalizeTag(tag);
        return problems.values().stream()
                .filter(problem -> status == null || problem.getStatus() == status)
                .filter(problem -> difficulty == null || problem.getDifficulty() == difficulty)
                .filter(problem -> normalizedTag == null || problem.getTags().stream()
                        .anyMatch(existing -> existing.equalsIgnoreCase(normalizedTag)))
                .sorted(Comparator
                        .comparing(Problem::getLastAttemptedOn, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(Problem::getCreatedOn, Comparator.reverseOrder()))
                .collect(Collectors.toList());
    }

    public synchronized Problem getProblem(long id) {
        return problems.get(id);
    }

    public synchronized ProblemSummary getSummary() {
        int total = problems.size();
        int solved = (int) problems.values().stream().filter(problem -> problem.getStatus() == ProblemStatus.SOLVED).count();
        int inProgress = (int) problems.values().stream().filter(problem -> problem.getStatus() == ProblemStatus.IN_PROGRESS).count();
        int todo = (int) problems.values().stream().filter(problem -> problem.getStatus() == ProblemStatus.TODO).count();
        List<Integer> durations = problems.values().stream()
                .flatMap(problem -> problem.getAttempts().stream())
                .map(Attempt::getDurationMinutes)
                .filter(value -> value != null)
                .toList();
        int totalAttempts = problems.values().stream().mapToInt(Problem::getAttemptCount).sum();
        double averageMinutes = durations.isEmpty() ? 0 : durations.stream().mapToInt(Integer::intValue).average().orElse(0);
        return new ProblemSummary(total, solved, inProgress, todo, totalAttempts, averageMinutes);
    }

    public synchronized Problem createProblem(ProblemForm form) {
        long id = idGenerator.incrementAndGet();
        String title = normalizeRequired("Title", form.getTitle());
        Difficulty difficulty = form.getDifficulty();
        ProblemStatus status = form.getStatus();
        String url = normalizeOptional(form.getUrl());
        String notes = normalizeOptional(form.getNotes());
        List<String> tags = parseTags(form.getTags());
        String slug = toSlug(title);
        Problem problem = new Problem(id, title, slug, difficulty, status, url, notes, LocalDate.now(), tags);
        if (status == ProblemStatus.SOLVED) {
            problem.markSolved(LocalDate.now());
        }
        problems.put(id, problem);
        return problem;
    }

    public synchronized Attempt addAttempt(long problemId, AttemptForm form) {
        Problem problem = problems.get(problemId);
        if (problem == null) {
            throw new IllegalArgumentException("Problem not found");
        }
        Attempt attempt = new Attempt(
                attemptIdGenerator.incrementAndGet(),
                form.getAttemptedOn(),
                form.getOutcome(),
                form.getRuntimeMs(),
                form.getMemoryMb(),
                form.getDurationMinutes(),
                normalizeOptional(form.getLanguage()),
                normalizeOptional(form.getNotes()));
        problem.addAttempt(attempt);
        if (form.getOutcome() == AttemptOutcome.ACCEPTED) {
            problem.markSolved(form.getAttemptedOn());
        } else {
            problem.markInProgress();
        }
        return attempt;
    }

    private void seedData() {
        Problem twoSum = seedProblem("Two Sum", Difficulty.EASY, ProblemStatus.SOLVED,
                "https://leetcode.com/problems/two-sum/", "arrays, hash map", LocalDate.now().minusDays(10));
        seedAttempt(twoSum, AttemptOutcome.FAILED, 7, 35, 20, "Java", "Forgot to account for duplicate values", LocalDate.now().minusDays(9));
        seedAttempt(twoSum, AttemptOutcome.ACCEPTED, 3, 34, 18, "Java", "Hash map pass", LocalDate.now().minusDays(8));

        Problem longestSubstring = seedProblem("Longest Substring Without Repeating Characters", Difficulty.MEDIUM,
                ProblemStatus.IN_PROGRESS, "https://leetcode.com/problems/longest-substring-without-repeating-characters/",
                "sliding window, hash set", LocalDate.now().minusDays(6));
        seedAttempt(longestSubstring, AttemptOutcome.TLE, 125, 58, 45, "Python", "Need optimized window", LocalDate.now().minusDays(5));

        seedProblem("Merge Intervals", Difficulty.MEDIUM, ProblemStatus.TODO,
                "https://leetcode.com/problems/merge-intervals/", "sorting, intervals", LocalDate.now().minusDays(3));

        Problem wordBreak = seedProblem("Word Break", Difficulty.HARD, ProblemStatus.IN_PROGRESS,
                "https://leetcode.com/problems/word-break/", "dp, trie", LocalDate.now().minusDays(2));
        seedAttempt(wordBreak, AttemptOutcome.PARTIAL, 90, 80, 60, "Java", "Need memoization", LocalDate.now().minusDays(1));
    }

    private Problem seedProblem(String title,
                                Difficulty difficulty,
                                ProblemStatus status,
                                String url,
                                String tags,
                                LocalDate createdOn) {
        long id = idGenerator.incrementAndGet();
        Problem problem = new Problem(id,
                title,
                toSlug(title),
                difficulty,
                status,
                url,
                null,
                createdOn,
                parseTags(tags));
        if (status == ProblemStatus.SOLVED) {
            problem.markSolved(createdOn);
        }
        problems.put(id, problem);
        return problem;
    }

    private void seedAttempt(Problem problem,
                             AttemptOutcome outcome,
                             Integer runtimeMs,
                             Integer memoryMb,
                             Integer durationMinutes,
                             String language,
                             String notes,
                             LocalDate date) {
        Attempt attempt = new Attempt(
                attemptIdGenerator.incrementAndGet(),
                date,
                outcome,
                runtimeMs,
                memoryMb,
                durationMinutes,
                language,
                notes);
        problem.addAttempt(attempt);
        if (outcome == AttemptOutcome.ACCEPTED) {
            problem.markSolved(date);
        }
    }

    private String normalizeRequired(String label, String value) {
        if (!StringUtils.hasText(value)) {
            throw new IllegalArgumentException(label + " is required");
        }
        return value.trim();
    }

    private String normalizeOptional(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private List<String> parseTags(String raw) {
        if (!StringUtils.hasText(raw)) {
            return new ArrayList<>();
        }
        return List.of(raw.split(","))
                .stream()
                .map(String::trim)
                .filter(StringUtils::hasText)
                .map(tag -> tag.toLowerCase(Locale.US))
                .distinct()
                .collect(Collectors.toList());
    }

    private String normalizeTag(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        return raw.trim().toLowerCase(Locale.US);
    }

    private String toSlug(String title) {
        String normalized = title.trim().toLowerCase(Locale.US);
        String cleaned = normalized.replaceAll("[^a-z0-9]+", "-");
        return cleaned.replaceAll("(^-+|-+$)", "");
    }
}
