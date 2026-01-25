# Technical README: YouTube Top-K POC

This document explains the architecture, flow, and file-by-file purpose of the YouTube top-K proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC and Thymeleaf for server-rendered UI.
- **Storage**: In-memory `HashMap` of videos keyed by id.
- **Domain**: `VideoRecord` tracks title, channel, tags, views, likes, and timestamps.
- **Ranking**: `VideoService` computes score = views × viewWeight + likes × likeWeight; top-K is sorted by score, then likes, views, and recency.
- **Controllers**: `VideoController` renders the UI, handles form posts, and exposes JSON endpoints.
- **Views**: `index.html` contains forms for leaderboard queries, video upserts, and engagement events.

## File Structure
```
youTube-top-K-poc/
├── pom.xml                                      # Maven configuration (Spring Boot, Thymeleaf, validation)
├── src/main/java/com/randomproject/youtubetopk/
│   ├── YouTubeTopKPocApplication.java           # Boots the Spring application
│   ├── VideoRecord.java                         # Video domain model
│   ├── VideoScore.java                          # Pair of video + computed score
│   ├── VideoService.java                        # In-memory store + ranking logic
│   ├── VideoController.java                     # MVC controller + REST endpoints
│   ├── VideoUpsertRequest.java                  # Validation-backed JSON payload for upserts
│   ├── VideoEventRequest.java                   # Validation-backed JSON payload for engagement
│   ├── VideoResponse.java                       # JSON response for videos
│   └── TopVideoResponse.java                    # JSON response for leaderboard entries
└── src/main/resources/
    ├── application.properties                  # Port + weights + validation limits
    └── templates/
        └── index.html                           # Leaderboard UI + forms
```

## Flow
1. **Home**: GET `/` renders `index.html` with current videos and a default top-K list.
2. **Leaderboard**: POST `/top` validates inputs, fetches the ranking list, and redirects back with flash attributes.
3. **Upsert video**: POST `/videos` validates id/title/channel/tags, stores or updates the video, and redirects back.
4. **Engagement**: POST `/events` increments views/likes and redirects back.
5. **API**: `/api/top`, `/api/videos`, `/api/events` expose the same behavior over JSON.

## Notable Implementation Details
- **Tag normalization**: Tags are trimmed, de-duplicated, and matched case-insensitively.
- **Score weights**: Configurable via `topk.view-weight` and `topk.like-weight`.
- **Limits**: `topk.max-limit`, `topk.max-tags`, and per-field length limits protect inputs.
- **Thread safety**: Service methods are synchronized for basic correctness in a single-node demo.

## Configuration
- `server.port=8099` — avoid clashing with other POCs.
- `topk.default-limit=5` — default leaderboard size.
- `topk.view-weight=1` and `topk.like-weight=4` — score weights.
- `topk.max-*` — input guards for ids, tags, and text.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
