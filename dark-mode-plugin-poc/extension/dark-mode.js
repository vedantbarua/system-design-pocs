(function () {
  const STYLE_ID = "default-dark-mode-poc-style";
  const ROOT_ATTR = "data-default-dark-mode-poc";
  const STORAGE_KEYS = {
    globalEnabled: "darkModeGlobalEnabled",
    disabledHosts: "darkModeDisabledHosts"
  };
  const DEFAULT_STATE = {
    globalEnabled: true,
    disabledHosts: {}
  };

  const palette = {
    canvas: "#101418",
    surface: "#171d23",
    surfaceRaised: "#202832",
    text: "#edf2f7",
    mutedText: "#aab7c4",
    border: "#3b4652",
    accent: "#67d7c4"
  };

  function currentHost() {
    return window.location.hostname || "local-file";
  }

  function normalizeState(rawState) {
    return {
      globalEnabled: rawState.globalEnabled !== false,
      disabledHosts: rawState.disabledHosts && typeof rawState.disabledHosts === "object"
        ? rawState.disabledHosts
        : {}
    };
  }

  function isEnabledForHost(state, host) {
    return state.globalEnabled && !state.disabledHosts[host];
  }

  function readState(callback) {
    if (!globalThis.chrome?.storage?.sync) {
      callback(DEFAULT_STATE);
      return;
    }

    chrome.storage.sync.get(STORAGE_KEYS, (stored) => {
      callback(normalizeState({
        globalEnabled: stored[STORAGE_KEYS.globalEnabled],
        disabledHosts: stored[STORAGE_KEYS.disabledHosts]
      }));
    });
  }

  function buildStyleText() {
    return `
:root[${ROOT_ATTR}="on"] {
  color-scheme: dark !important;
  --default-dark-mode-poc-canvas: ${palette.canvas};
  --default-dark-mode-poc-surface: ${palette.surface};
  --default-dark-mode-poc-surface-raised: ${palette.surfaceRaised};
  --default-dark-mode-poc-text: ${palette.text};
  --default-dark-mode-poc-muted-text: ${palette.mutedText};
  --default-dark-mode-poc-border: ${palette.border};
  --default-dark-mode-poc-accent: ${palette.accent};
}

:root[${ROOT_ATTR}="on"],
:root[${ROOT_ATTR}="on"] body {
  background: var(--default-dark-mode-poc-canvas) !important;
  color: var(--default-dark-mode-poc-text) !important;
}

:root[${ROOT_ATTR}="on"] body,
:root[${ROOT_ATTR}="on"] article,
:root[${ROOT_ATTR}="on"] section,
:root[${ROOT_ATTR}="on"] main,
:root[${ROOT_ATTR}="on"] aside,
:root[${ROOT_ATTR}="on"] nav,
:root[${ROOT_ATTR}="on"] header,
:root[${ROOT_ATTR}="on"] footer,
:root[${ROOT_ATTR}="on"] div,
:root[${ROOT_ATTR}="on"] p,
:root[${ROOT_ATTR}="on"] li,
:root[${ROOT_ATTR}="on"] td,
:root[${ROOT_ATTR}="on"] th,
:root[${ROOT_ATTR}="on"] label,
:root[${ROOT_ATTR}="on"] span {
  border-color: var(--default-dark-mode-poc-border) !important;
}

:root[${ROOT_ATTR}="on"] h1,
:root[${ROOT_ATTR}="on"] h2,
:root[${ROOT_ATTR}="on"] h3,
:root[${ROOT_ATTR}="on"] h4,
:root[${ROOT_ATTR}="on"] h5,
:root[${ROOT_ATTR}="on"] h6,
:root[${ROOT_ATTR}="on"] p,
:root[${ROOT_ATTR}="on"] li,
:root[${ROOT_ATTR}="on"] dt,
:root[${ROOT_ATTR}="on"] dd,
:root[${ROOT_ATTR}="on"] blockquote,
:root[${ROOT_ATTR}="on"] figcaption,
:root[${ROOT_ATTR}="on"] label,
:root[${ROOT_ATTR}="on"] small {
  color: inherit !important;
}

:root[${ROOT_ATTR}="on"] a {
  color: var(--default-dark-mode-poc-accent) !important;
}

:root[${ROOT_ATTR}="on"] input,
:root[${ROOT_ATTR}="on"] textarea,
:root[${ROOT_ATTR}="on"] select,
:root[${ROOT_ATTR}="on"] button,
:root[${ROOT_ATTR}="on"] [role="button"] {
  background-color: var(--default-dark-mode-poc-surface-raised) !important;
  color: var(--default-dark-mode-poc-text) !important;
  border-color: var(--default-dark-mode-poc-border) !important;
}

:root[${ROOT_ATTR}="on"] table,
:root[${ROOT_ATTR}="on"] pre,
:root[${ROOT_ATTR}="on"] code,
:root[${ROOT_ATTR}="on"] dialog,
:root[${ROOT_ATTR}="on"] details,
:root[${ROOT_ATTR}="on"] summary {
  background-color: var(--default-dark-mode-poc-surface) !important;
  color: var(--default-dark-mode-poc-text) !important;
  border-color: var(--default-dark-mode-poc-border) !important;
}

:root[${ROOT_ATTR}="on"] img,
:root[${ROOT_ATTR}="on"] video,
:root[${ROOT_ATTR}="on"] canvas,
:root[${ROOT_ATTR}="on"] svg {
  filter: brightness(0.88) contrast(1.08) !important;
}

:root[${ROOT_ATTR}="on"] [data-default-dark-mode-poc-surface="true"] {
  background-color: var(--default-dark-mode-poc-surface) !important;
  color: var(--default-dark-mode-poc-text) !important;
}
`;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = buildStyleText();
    (document.head || document.documentElement).appendChild(style);
  }

  function removeStyle() {
    document.getElementById(STYLE_ID)?.remove();
  }

  function looksLight(rgb) {
    const match = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!match) return false;
    const r = Number(match[1]);
    const g = Number(match[2]);
    const b = Number(match[3]);
    return (r * 299 + g * 587 + b * 114) / 1000 > 180;
  }

  function markLightSurfaces(root) {
    if (!root?.querySelectorAll) return;
    const surfaceSelector = "body, main, article, section, aside, nav, header, footer, div, form, table";
    const nodes = [
      ...(root.matches?.(surfaceSelector) ? [root] : []),
      ...root.querySelectorAll(surfaceSelector)
    ];
    for (const node of nodes) {
      const computed = window.getComputedStyle(node);
      if (looksLight(computed.backgroundColor)) {
        node.dataset.defaultDarkModePocSurface = "true";
      }
    }
  }

  function applyDarkMode() {
    ensureStyle();
    document.documentElement.setAttribute(ROOT_ATTR, "on");
    if (document.body) markLightSurfaces(document);
  }

  function removeDarkMode() {
    document.documentElement.removeAttribute(ROOT_ATTR);
    removeStyle();
    document.querySelectorAll("[data-default-dark-mode-poc-surface]").forEach((node) => {
      delete node.dataset.defaultDarkModePocSurface;
    });
  }

  function installMutationObserver() {
    if (!globalThis.MutationObserver) return;
    const observer = new MutationObserver((mutations) => {
      if (document.documentElement.getAttribute(ROOT_ATTR) !== "on") return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) markLightSurfaces(node);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function syncFromStorage() {
    readState((state) => {
      if (isEnabledForHost(state, currentHost())) {
        applyDarkMode();
      } else {
        removeDarkMode();
      }
    });
  }

  function boot() {
    syncFromStorage();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", syncFromStorage, { once: true });
    }
    installMutationObserver();
  }

  if (globalThis.chrome?.storage?.onChanged) {
    chrome.storage.onChanged.addListener(syncFromStorage);
  }

  globalThis.DefaultDarkModePoc = {
    applyDarkMode,
    removeDarkMode,
    normalizeState,
    isEnabledForHost,
    looksLight
  };

  boot();
})();
