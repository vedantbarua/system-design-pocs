# Technical README: Netflix POC

This document explains the architecture, flow, and file layout of the Netflix proof-of-concept.

## Architecture Overview
- **Framework**: Spring Boot 3.2 with MVC + Thymeleaf.
- **Storage**: In-memory maps for catalog, profiles, watchlists, and playback progress.
- **Ranking**: Recommendations blend popularity, genre overlap, and recency.
- **Playback**: Each playback event stores progress and increments plays on the first start.
- **Controllers**: `NetflixController` serves the UI and JSON APIs from a single service.

## File Structure
```
netflix-poc/
├── pom.xml                                     # Maven configuration (Spring Boot, Thymeleaf, validation)
├── README.md                                   # Usage + endpoints
├── TECHNICAL_README.md                         # Architecture notes
├── IMPROVEMENTS.md                             # Future ideas
└── src/main/
    ├── java/com/randomproject/netflix/
    │   ├── NetflixPocApplication.java          # Spring Boot entry point
    │   ├── NetflixController.java              # MVC controller + JSON endpoints
    │   ├── NetflixService.java                 # In-memory store + recommendation logic
    │   ├── CatalogItem.java                    # Content domain model
    │   ├── CatalogType.java                    # MOVIE/SERIES enum
    │   ├── Profile.java                        # Profile domain model
    │   ├── WatchProgress.java                  # Playback progress state
    │   ├── RecommendationEntry.java            # Scored recommendation tuple
    │   ├── ContinueWatchingEntry.java          # Continue watching tuple
    │   ├── CatalogUpsertRequest.java           # Validation-backed JSON payload
    │   ├── ProfileCreateRequest.java           # Validation-backed JSON payload
    │   ├── PlaybackRequest.java                # Validation-backed JSON payload
    │   ├── WatchlistRequest.java               # Validation-backed JSON payload
    │   ├── CatalogResponse.java                # JSON response DTO
    │   ├── ProfileResponse.java                # JSON response DTO
    │   ├── RecommendationResponse.java         # JSON response DTO
    │   ├── ContinueWatchingResponse.java       # JSON response DTO
    │   └── PlaybackResponse.java               # JSON response DTO
    └── resources/
        ├── application.properties              # Port + ranking weights + limits
        └── templates/
            └── index.html                      # Netflix-style UI
```

## Flow
1. **Home**: GET `/` resolves the active profile and renders recommendations, watchlist, continue-watching, trending, and catalog search results.
2. **Profiles**: POST `/profiles` creates a profile with preferred genres and maturity limits.
3. **Catalog**: POST `/catalog` upserts titles with metadata and genres.
4. **Watchlist**: POST `/watchlist` adds or removes saved titles per profile.
5. **Playback**: POST `/playback` records progress and increments plays on first start.
6. **API**: `/api/*` endpoints expose the same flows over JSON.

## Recommendation Details
- **Score** = popularity × weight + (genre matches × weight) + recency boost.
- **Recency** favors titles released within the last 6 years.
- **Maturity** filters titles above a profile's rating limit.

## Configuration
- `server.port=8100` — avoid port collisions with other POCs.
- `netflix.default-limit` — default recommendation size.
- `netflix.max-limit` — cap on API list sizes.
- `netflix.genre-weight`, `netflix.popularity-weight`, `netflix.recency-weight` — tuning knobs.
- `netflix.max-*` — input validation limits.

## Build/Run
- `mvn org.springframework.boot:spring-boot-maven-plugin:run`
