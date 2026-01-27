# Netflix POC

Spring Boot proof-of-concept for a Netflix-style streaming experience with catalog, recommendations, watchlists, and playback tracking.

## Features
- Browse a seeded catalog of movies and series
- Profile-based recommendations with genre and recency boosts
- Trending list based on popularity and playback starts
- Watchlist and continue-watching shelves
- UI + JSON API for catalog, profiles, playback, and search
- In-memory storage resets on restart

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd netflix-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8100` for the UI.

## Endpoints
- `/` — Main UI with catalog, recommendations, and forms
- `/profiles` `POST` — Create profile (form)
- `/catalog` `POST` — Add/update content (form)
- `/watchlist` `POST` — Add/remove watchlist item (form)
- `/playback` `POST` — Record playback progress (form)
- `/api/catalog` `GET` — List catalog items
- `/api/catalog` `POST` — Create/update catalog item
- `/api/profiles` `GET` — List profiles
- `/api/profiles` `POST` — Create profile
- `/api/recommendations` `GET` — Recommendations (`profileId`, optional `limit`)
- `/api/trending` `GET` — Trending list (`limit` optional)
- `/api/continue` `GET` — Continue watching (`profileId`, optional `limit`)
- `/api/watchlist` `GET` — Watchlist (`profileId`)
- `/api/watchlist` `POST` — Update watchlist (add/remove)
- `/api/playback` `POST` — Record playback progress
- `/api/search` `GET` — Search catalog (`query`, `genre`)

## Notes
- Recommendations score = popularity × weight + genre matches × weight + recency boost.
- Maturity filtering uses a simple rating rank map (G, PG, PG-13/TV-14, R/TV-MA).
- IDs accept letters, numbers, `.`, `_`, `-`, or `:`.

## Technologies
- Spring Boot 3.2
- Java 17
- Thymeleaf
- In-memory maps for storage

See `TECHNICAL_README.md` for detailed architecture and `IMPROVEMENTS.md` for next steps.
