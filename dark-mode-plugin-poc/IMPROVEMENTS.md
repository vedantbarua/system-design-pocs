# Default Dark Mode Plugin Improvements

## Production Gaps

- Add extension icons, store metadata, and browser-specific packages.
- Create Firefox and Safari variants instead of assuming Chromium APIs.
- Add a settings page for palette, contrast, image dimming, and scheduler preferences.
- Build a compatibility registry for sites that need custom selectors.

## Reliability Improvements

- Add Playwright extension tests that load real pages and verify computed colors.
- Add startup flash measurements to catch pages that render bright before conversion.
- Track conversion decisions locally in a debug panel so users can report broken pages.
- Add guardrails for pages with strict CSP, iframes, and shadow DOM boundaries.

## Scaling Improvements

- Replace broad layout scanning with batched idle-time scans on very large documents.
- Cache host conversion profiles after the first scan.
- Add throttling around mutation handling for pages with heavy DOM churn.
- Split site adapters into optional modules loaded only when host rules match.

## Security Improvements

- Keep permissions as narrow as possible for production release channels.
- Avoid remote code and dynamic script evaluation.
- Document all storage keys and never store page content.
- Add automated checks for extension permission drift.

## Testing Improvements

- Add unit tests for storage normalization and host matching.
- Add browser tests for popup state changes.
- Add fixture pages for forms, tables, media, iframes, and shadow DOM.
- Add visual regression screenshots for light-to-dark conversion quality.
