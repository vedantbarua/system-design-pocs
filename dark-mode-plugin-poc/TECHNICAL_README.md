# Default Dark Mode Plugin Technical README

## Problem Statement

Dark-mode plugins have to modify pages they do not own. The hard parts are applying a default theme early enough to avoid bright flashes, preserving readability across unknown markup, handling dynamic applications, and giving users a way to opt out when a page does not convert cleanly.

## Architecture Overview

The POC is a Manifest V3 extension with two main parts:

- `extension/dark-mode.js`: content script injected into every page at `document_start`.
- `extension/popup.html`, `popup.css`, and `popup.js`: extension action popup for global and per-site controls.

The content script reads settings from `chrome.storage.sync`, decides whether the current host should be converted, injects one scoped stylesheet, and marks detected light surfaces with a data attribute. All rules are scoped behind `:root[data-default-dark-mode-poc="on"]`, so disabling dark mode removes the root attribute and stylesheet.

## Core Data Model

Settings are stored in browser sync storage:

```json
{
  "darkModeGlobalEnabled": true,
  "darkModeDisabledHosts": {
    "news.example.com": true
  }
}
```

Runtime DOM markers:

- `data-default-dark-mode-poc="on"` on the root element means dark mode is active.
- `data-default-dark-mode-poc-surface="true"` marks elements whose computed background is light enough to override.

## Request Or Event Flow

1. Browser matches a page against `<all_urls>`.
2. Manifest injects `dark-mode.js` at `document_start`.
3. Content script reads global and host-level state.
4. If enabled, the script injects the stylesheet and sets the root activation attribute.
5. Once the DOM is available, the script scans common layout elements for light backgrounds.
6. A mutation observer scans newly inserted elements.
7. Popup changes are written to `chrome.storage.sync`.
8. `chrome.storage.onChanged` causes active content scripts to re-read state and apply or remove dark mode.

## Key Tradeoffs

- CSS-first conversion is fast and simple, but cannot perfectly understand every site design.
- Light-surface detection avoids rewriting every element, but it depends on computed style availability.
- The content script dims media with a generic filter, which improves bright images but can reduce fidelity.
- Per-host opt-out is more practical than trying to perfectly support every possible page in the first iteration.

## Failure Handling

- If `chrome.storage.sync` is unavailable, the script falls back to enabled-by-default local behavior.
- If a host is disabled, the script removes its stylesheet, root marker, and surface markers.
- If `MutationObserver` is unavailable, initial conversion still works; dynamic content may remain unconverted.
- Invalid stored state is normalized to safe defaults.

## Scaling Path

- Add a site adapter registry for known high-traffic domains.
- Add shadow DOM traversal where allowed by the page.
- Persist user-selected intensity, contrast, and media handling settings.
- Move palette generation into a small theme engine with WCAG contrast checks.
- Add telemetry-free local diagnostics showing which selectors were overridden.
- Support managed enterprise policy for default allowlists and blocklists.

## What Is Intentionally Simplified

- No build step or bundler.
- No browser-specific packaging.
- No Firefox-specific manifest variant.
- No automated browser integration test.
- No custom icon assets.
- No remote configuration or analytics.
