const STORAGE_KEYS = {
  globalEnabled: "darkModeGlobalEnabled",
  disabledHosts: "darkModeDisabledHosts"
};

const globalToggle = document.getElementById("global-toggle");
const siteToggle = document.getElementById("site-toggle");
const statusNode = document.getElementById("status");
const hostNode = document.getElementById("host");

let activeHost = "";
let currentState = {
  globalEnabled: true,
  disabledHosts: {}
};

function normalizeState(stored) {
  return {
    globalEnabled: stored[STORAGE_KEYS.globalEnabled] !== false,
    disabledHosts: stored[STORAGE_KEYS.disabledHosts] && typeof stored[STORAGE_KEYS.disabledHosts] === "object"
      ? stored[STORAGE_KEYS.disabledHosts]
      : {}
  };
}

function render() {
  globalToggle.checked = currentState.globalEnabled;
  siteToggle.checked = currentState.globalEnabled && !currentState.disabledHosts[activeHost];
  siteToggle.disabled = !currentState.globalEnabled;
  hostNode.textContent = activeHost || "Current site";
  statusNode.textContent = siteToggle.checked ? "Dark mode is active here" : "Dark mode is off here";
}

async function loadActiveHost() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tabs[0]?.url ? new URL(tabs[0].url) : null;
  activeHost = url?.hostname || "local-file";
}

function loadState() {
  chrome.storage.sync.get(Object.values(STORAGE_KEYS), (stored) => {
    currentState = normalizeState(stored);
    render();
  });
}

function saveState(nextState) {
  currentState = nextState;
  chrome.storage.sync.set({
    [STORAGE_KEYS.globalEnabled]: nextState.globalEnabled,
    [STORAGE_KEYS.disabledHosts]: nextState.disabledHosts
  }, render);
}

globalToggle.addEventListener("change", () => {
  saveState({
    ...currentState,
    globalEnabled: globalToggle.checked
  });
});

siteToggle.addEventListener("change", () => {
  const disabledHosts = { ...currentState.disabledHosts };
  if (siteToggle.checked) {
    delete disabledHosts[activeHost];
  } else {
    disabledHosts[activeHost] = true;
  }
  saveState({ ...currentState, disabledHosts });
});

loadActiveHost().then(loadState);
