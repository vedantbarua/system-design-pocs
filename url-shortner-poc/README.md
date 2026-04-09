# URL Shortener POC

Spring Boot proof-of-concept for shortening and redirecting links with a small UI, JSON endpoints, custom aliases, and hit counting. It is a compact project, but it surfaces the parts of a URL shortener that actually matter: code generation, alias uniqueness, redirect handling, and analytics basics.

## Why This POC Matters

A URL shortener is one of the classic system design exercises because it combines write-heavy creation paths, read-heavy redirect paths, uniqueness constraints, and analytics follow-up. This POC focuses on those fundamentals without burying them under infrastructure.

## What You Can Do

- Create short links from the browser or the JSON API
- Provide a custom alias or let the app generate one automatically
- Follow redirect links at `/s/{code}`
- Inspect per-link hit counts
- Review all existing links in the UI or through JSON

## Quick Start

```bash
cd url-shortner-poc
mvn org.springframework.boot:spring-boot-maven-plugin:run
```

Open `http://localhost:8082`. Redirect links are served from `http://localhost:8082/s/{code}`.

## Demo Flow

1. Create a short link with a custom alias.
2. Create another link without an alias to see generated base-36 codes.
3. Open the short URL a few times.
4. Return to the dashboard and confirm the hit counter increased.

## Endpoints

- `GET /` renders the create-link form and current links
- `POST /shorten` creates a link from form data
- `GET /s/{code}` redirects to the target URL and increments hits
- `POST /api/shorten` accepts `{ "url": "...", "alias": "optional" }`
- `GET /api/links` returns all links
- `GET /api/links/{code}` returns one link

## Configuration

- `server.port` defaults to `8082`
- `app.base-url` defaults to `http://localhost:8082`

## Design Notes

- Auto-generated codes come from an incrementing counter converted to base 36.
- URL normalization adds `https://` when needed and validates the host.
- The store is in memory, so the app emphasizes behavior over persistence.

## Limitations

- No distributed code generation
- No expiry or abuse controls
- No persistent analytics pipeline
- Restarting the app clears all links

## Related Docs

- [TECHNICAL_README.md](TECHNICAL_README.md)
- [IMPROVEMENTS.md](IMPROVEMENTS.md)
