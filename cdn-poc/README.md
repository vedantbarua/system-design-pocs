# CDN POC

Spring Boot proof-of-concept for a CDN with an origin catalog, regional edge caches, TTL-based expiry, LRU eviction, and cache invalidation.

## Features
- Publish assets to an origin with cache TTLs
- Route delivery requests to regional edge nodes
- Track cache hits, misses, origin fetches, and evictions
- Invalidate by exact path or prefix
- Explore the system through a small UI or JSON API

## Quick Start
1. Ensure Java 17+ and Maven are installed.
2. Run the app:
   ```bash
   cd cdn-poc
   mvn org.springframework.boot:spring-boot-maven-plugin:run
   ```
3. Open `http://localhost:8133` for the UI.

## Endpoints
- `/` `GET` - UI dashboard
- `/origin/assets` `POST` - Publish/update origin asset
- `/deliver` `POST` - Deliver an asset through the CDN
- `/invalidate` `POST` - Invalidate by path or prefix
- `/api/origin/assets` `GET|POST`
- `/api/deliver` `POST`
- `/api/invalidate` `POST`
- `/api/edges` `GET`
- `/api/cache` `GET`

## Example API Flow
1. Publish an asset:
   ```bash
   curl -X POST http://localhost:8133/api/origin/assets \
     -H "Content-Type: application/json" \
     -d '{"path":"/images/hero.txt","content":"homepage hero metadata","cacheTtlSeconds":45}'
   ```
2. Deliver from the NA region:
   ```bash
   curl -X POST http://localhost:8133/api/deliver \
     -H "Content-Type: application/json" \
     -d '{"path":"/images/hero.txt","region":"NA"}'
   ```
3. Invalidate a prefix:
   ```bash
   curl -X POST http://localhost:8133/api/invalidate \
     -H "Content-Type: application/json" \
     -d '{"prefix":"/images/"}'
   ```

## Notes
- State is in memory only; restart clears origin assets and edge caches.
- If the origin content changes, cached copies stay stale until TTL expiry or explicit invalidation.
- Delivery returns an estimated latency number for demonstration; no real network delay is introduced.
- Edge caches use a simple LRU policy when capacity is reached.

## Technologies
- Spring Boot 3.2 (web + Thymeleaf + validation)
- Java 17
- In-memory origin map and edge caches
