# Improvements and Next Steps: Web Crawler POC

## Core Behavior
- Add politeness features (robots.txt parsing, crawl delay per host).
- Support depth-first or priority-based traversal strategies.
- Deduplicate URLs by canonicalization rules and query filtering.
- Add support for sitemap discovery and seed lists.

## API & UX
- Add a progress endpoint for long-running crawls.
- Provide per-page detail views with extracted links.
- Allow exporting results as CSV or JSON file.
- Add filters for status codes and content types in the UI.

## Reliability & Ops
- Add retries and backoff for transient failures.
- Persist crawl state in a database or queue for resuming.
- Add metrics for response times and error rates.
- Add Dockerfile and CI workflow.

## Security
- Add allow/deny lists for hostnames.
- Restrict crawl scope with network egress controls.
- Add auth to protect the API.

## Testing
- Unit tests for URL normalization and link extraction.
- MVC tests for validation errors and API responses.
