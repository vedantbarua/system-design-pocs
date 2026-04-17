# Default Dark Mode Plugin POC

A browser extension proof-of-concept that converts any page to dark mode by default while allowing global and per-site opt-outs.

## Goal

Demonstrate the core mechanics behind a browser plugin that applies a readable dark theme to arbitrary web pages, persists user preferences, and handles content inserted after page load.

## What It Covers

- Manifest V3 browser extension structure.
- Content script injection at `document_start`.
- CSS-variable based dark-mode overrides.
- Lightweight detection of bright page surfaces.
- Mutation observer support for dynamic pages.
- Popup controls for global enablement and per-host exceptions.
- A local demo page for testing common page elements.

## Quick Start

1. Open Chrome or Edge and go to `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select `dark-mode-plugin-poc/extension`.
5. Open `dark-mode-plugin-poc/demo/index.html` in the browser.
6. Use the extension popup to turn dark mode on globally or disable it for the current host.

Run the small engine test:

```bash
npm test
```

## UI Flows

- Open any page and the content script applies dark mode automatically.
- Open the extension popup and disable dark mode everywhere.
- Re-enable global dark mode and disable only the current host.
- On the demo page, click `Add dynamic card`; the mutation observer marks the new light surface for conversion.

## JSON Or WebSocket Endpoints

This POC has no server endpoints. It uses browser extension APIs:

- `chrome.storage.sync.get` reads global and host-specific settings.
- `chrome.storage.sync.set` persists settings.
- `chrome.storage.onChanged` updates active tabs after popup changes.

Stored state shape:

```json
{
  "darkModeGlobalEnabled": true,
  "darkModeDisabledHosts": {
    "example.com": true
  }
}
```

## Configuration

No environment variables are required.

The default palette is defined in `extension/dark-mode.js`. Host-level behavior is controlled through extension storage from the popup.

## Notes And Limitations

- This is a POC, not a polished accessibility product.
- Very custom pages with canvas-heavy rendering, closed shadow DOM, or aggressive inline styles may need site-specific adapters.
- Images and video are dimmed with a conservative filter, but media-aware controls would be needed for production quality.
- Browser extension APIs are available only after loading the extension; opening the content script directly will use its local fallback behavior.

## Technologies Used

- Browser Extension Manifest V3
- JavaScript content scripts
- Chrome extension storage APIs
- Static HTML/CSS demo page
- Node.js built-in test harness primitives
