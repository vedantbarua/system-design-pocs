# LeetCode POC

LeetCode-style practice tracker built with Spring Boot and Thymeleaf. It manages problems, attempts, status changes, and progress summaries so the system feels closer to a real interview-prep workspace than a single static list.

## Why This POC Matters

This is a lighter consumer-style project, but it still demonstrates useful system behavior: state transitions, summary aggregation, filtered reads, and per-entity history. It is a good example of turning a familiar product into a small but structured backend.

## What It Covers

- Create problems with difficulty, status, tags, and notes
- Log attempts with runtime, memory, duration, language, and outcome
- Track transitions like `TODO`, `IN_PROGRESS`, and `SOLVED`
- Filter the board by status, difficulty, or tag
- View summary statistics across the whole problem set

## Quick Start

```bash
cd leetcode-poc
mvn org.springframework.boot:spring-boot-maven-plugin:run
```

Open `http://localhost:8101`.

## Demo Flow

1. Browse the seeded problem list on the home page.
2. Filter by difficulty or tag.
3. Open a problem detail page.
4. Log an attempt and watch the problem status and stats update.

## Main Routes

- `GET /` shows the problem board and filters
- `GET /new` shows the new-problem form
- `POST /problems` creates a problem
- `GET /problem/{id}` shows problem details and history
- `GET /problem/{id}/attempt` shows the attempt form
- `POST /problem/{id}/attempts` saves a new attempt

## Design Notes

- The service stores problems in memory and seeds starter data.
- Attempt outcomes drive status changes so the board reflects progress.
- Summary metrics are computed from the current dataset instead of being stored separately.

## Limitations

- No user accounts or multi-user tracking
- No persistent storage
- No recommendation engine or spaced repetition model
- Everything resets on restart

## Technologies

- Spring Boot 3.2
- Java 17
- Thymeleaf
- Bootstrap

## Related Docs

- [TECHNICAL_README.md](TECHNICAL_README.md)
- [IMPROVEMENTS.md](IMPROVEMENTS.md)
