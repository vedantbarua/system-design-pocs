const state = {
  data: null,
  selectedBranchId: null,
  lastPreview: null,
  currentUser: loadUser(),
  events: null,
  connectionStatus: "offline"
};

function loadUser() {
  try {
    const saved = JSON.parse(localStorage.getItem("context-collab-user") || "null");
    if (saved?.userId && saved?.name) return saved;
  } catch {
    // Ignore malformed local storage values.
  }
  return { userId: "local-user", name: "Local User", color: "#177245" };
}

function saveUser() {
  localStorage.setItem("context-collab-user", JSON.stringify(state.currentUser));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    throw new Error(body.error || body || "Request failed");
  }
  return body;
}

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function itemCount() {
  return (state.data?.branches || []).reduce((total, branch) => total + branch.items.length, 0);
}

function selectedBranchIds() {
  return [...document.querySelectorAll("[data-branch-check]:checked")].map((input) => input.value);
}

function summarizeTypes(items) {
  const counts = new Map();
  for (const item of items || []) {
    counts.set(item.type, (counts.get(item.type) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, count]) => `${type}: ${count}`)
    .join(" · ");
}

function notice(message, type = "success") {
  $("#notice").innerHTML = `<div class="notice ${type === "error" ? "error" : ""}">${escapeHtml(message)}</div>`;
}

function renderIdentity() {
  $("#userId").value = state.currentUser.userId;
  $("#userName").value = state.currentUser.name;
  $("#connectionState").textContent = state.connectionStatus;
  $("#connectionState").className = `connection-pill ${state.connectionStatus}`;

  const presence = state.data?.presence || [];
  $("#presenceList").innerHTML = presence.length
    ? presence.map((user) => `
      <div class="presence-user">
        <span class="presence-dot"></span>
        <div>
          <strong>${escapeHtml(user.name)}</strong>
          <small>${escapeHtml(user.userId)}</small>
        </div>
      </div>
    `).join("")
    : `<div class="empty compact">No active collaborators.</div>`;
}

function renderMetrics() {
  const workspace = state.data?.workspace;
  const metrics = [
    ["workspace", workspace?.name || "not initialized"],
    ["branches", state.data?.branches.length || 0],
    ["items", itemCount()],
    ["merges", state.data?.merges.length || 0],
    ["bundles", state.data?.bundles.length || 0],
    ["active users", state.data?.presence?.length || 0]
  ];

  $("#metrics").innerHTML = metrics.map(([label, value]) => `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function branchOptions() {
  const branches = state.data?.branches || [];
  return branches.map((branch) => `
    <option value="${branch.branchId}" ${branch.branchId === state.selectedBranchId ? "selected" : ""}>
      ${escapeHtml(branch.owner)}/${escapeHtml(branch.name)}
    </option>
  `).join("");
}

function renderBranchOptions() {
  const options = branchOptions();
  const branches = state.data?.branches || [];

  $("#itemBranchSelect").innerHTML = options;
  $("#importBranchSelect").innerHTML = options;
  $("#branchSelect").innerHTML = options;
  $("#branchCompareSelect").innerHTML = `<option value="">Select a branch</option>${options}`;
  $("#pullSourceSelect").innerHTML = `<option value="">Select a branch</option>${options}`;

  if (!state.selectedBranchId && branches[0]) {
    state.selectedBranchId = branches[0].branchId;
  }
}

function renderBranches() {
  const branches = state.data?.branches || [];
  $("#branches").innerHTML = branches.length ? branches.map((branch) => `
    <article class="branch ${branch.branchId === state.selectedBranchId ? "active" : ""}">
      <label class="branch-head">
        <input type="checkbox" data-branch-check value="${branch.branchId}" />
        <span class="branch-meta">
          <strong>${escapeHtml(branch.owner)}/${escapeHtml(branch.name)}</strong>
          <small>${branch.items.length} items · base ${escapeHtml(branch.baseCommit)}</small>
        </span>
      </label>
      <div class="branch-summary">
        <span>${escapeHtml(summarizeTypes(branch.items) || "No context items yet.")}</span>
        <button class="ghost" data-focus-branch="${branch.branchId}">Focus</button>
      </div>
      <div class="items compact-items">
        ${branch.items.slice(0, 4).map((item) => `
          <div class="item">
            <span class="badge">${escapeHtml(item.type)}</span>
            <p>${escapeHtml(item.summary)}</p>
            <small>${escapeHtml(item.createdBy)} · ${escapeHtml((item.files || []).join(", ") || "no files")}</small>
          </div>
        `).join("") || `<div class="empty compact">No items yet.</div>`}
      </div>
    </article>
  `).join("") : `<div class="empty">Initialize the workspace or seed the demo.</div>`;

  for (const button of document.querySelectorAll("[data-focus-branch]")) {
    button.addEventListener("click", () => {
      state.selectedBranchId = button.dataset.focusBranch;
      renderBranchOptions();
      renderBranchDetails();
      renderCompare();
      renderBranches();
    });
  }
}

function renderBranchDetails() {
  const branch = (state.data?.branches || []).find((candidate) => candidate.branchId === state.selectedBranchId);
  if (!branch) {
    $("#branchDetails").innerHTML = `<div class="empty">Select a branch to inspect its full timeline.</div>`;
    return;
  }

  $("#branchDetails").innerHTML = `
    <div class="detail-head">
      <div>
        <h3>${escapeHtml(branch.owner)}/${escapeHtml(branch.name)}</h3>
        <p>${escapeHtml(branch.items.length)} items · parent ${escapeHtml(branch.parentBranchId || "none")}</p>
      </div>
      <button class="ghost" id="pullFocusedBranch">Pull Into My Branch</button>
    </div>
    <div class="items detail-items">
      ${branch.items.map((item) => `
        <div class="item">
          <span class="badge">${escapeHtml(item.type)}</span>
          <p>${escapeHtml(item.summary)}</p>
          ${item.body ? `<div class="detail-text">${escapeHtml(item.body)}</div>` : ""}
          <small>${escapeHtml(item.createdBy)} · ${escapeHtml(item.confidence)} · ${escapeHtml((item.files || []).join(", ") || "no files")}</small>
        </div>
      `).join("") || `<div class="empty">No items in this branch yet.</div>`}
    </div>
  `;

  $("#pullFocusedBranch").addEventListener("click", async () => {
    await pullBranch(branch.branchId);
  });
}

function renderTimeline() {
  const audit = state.data?.audit || [];
  $("#timeline").innerHTML = audit.length ? audit.map((event) => `
    <div class="timeline-event">
      <div class="timeline-mark"></div>
      <div>
        <strong>${escapeHtml(event.event)}</strong>
        <p>${escapeHtml(
          [
            event.branchId,
            event.sourceBranchId,
            event.mergeId,
            event.bundleId,
            event.workspaceId,
            event.userId,
            event.owner,
            event.name
          ].filter(Boolean).join(" · ")
        )}</p>
        <small>${escapeHtml(event.at)}</small>
      </div>
    </div>
  `).join("") : `<div class="empty">No timeline activity yet.</div>`;
}

function renderCompare() {
  const branches = state.data?.branches || [];
  const selected = $("#branchCompareSelect").value;
  const primary = branches.find((branch) => branch.branchId === state.selectedBranchId);
  const secondary = branches.find((branch) => branch.branchId === selected);

  if (!primary || !secondary) {
    $("#branchCompare").innerHTML = `<div class="empty">Pick a focused branch and one comparison branch.</div>`;
    return;
  }

  const primaryKeys = new Set(primary.items.map((item) => `${item.type}:${item.summary.toLowerCase()}`));
  const secondaryKeys = new Set(secondary.items.map((item) => `${item.type}:${item.summary.toLowerCase()}`));
  const onlyPrimary = primary.items.filter((item) => !secondaryKeys.has(`${item.type}:${item.summary.toLowerCase()}`));
  const onlySecondary = secondary.items.filter((item) => !primaryKeys.has(`${item.type}:${item.summary.toLowerCase()}`));
  const overlap = primary.items.filter((item) => secondaryKeys.has(`${item.type}:${item.summary.toLowerCase()}`));

  $("#branchCompare").innerHTML = [
    ["Shared context", overlap],
    [`Only in ${primary.owner}/${primary.name}`, onlyPrimary],
    [`Only in ${secondary.owner}/${secondary.name}`, onlySecondary]
  ].map(([title, items]) => `
    <section class="compare-group">
      <h3>${escapeHtml(title)} <span>${items.length}</span></h3>
      ${items.length ? items.map((item) => `
        <div class="item">
          <span class="badge">${escapeHtml(item.type)}</span>
          <p>${escapeHtml(item.summary)}</p>
          <small>${escapeHtml((item.files || []).join(", ") || "no files")}</small>
        </div>
      `).join("") : `<div class="empty compact">None.</div>`}
    </section>
  `).join("");
}

function conflictCards(preview) {
  const groups = [
    ["Duplicates", preview.duplicateItems],
    ["Conflicts", preview.conflicts],
    ["Stale References", preview.staleReferences]
  ];

  return groups.map(([title, rows]) => `
    <div class="merge-group">
      <h3>${title} <span>${rows.length}</span></h3>
      ${rows.length ? rows.map((row) => `
        <div class="conflict">
          <strong>${escapeHtml(row.type)}</strong>
          <p>${escapeHtml(row.reason)}</p>
          <small>${escapeHtml([...(row.branchIds || []), ...(row.itemIds || []), row.file, row.symbol].filter(Boolean).join(" · "))}</small>
        </div>
      `).join("") : `<div class="empty compact">None detected.</div>`}
    </div>
  `).join("");
}

function renderBundles() {
  const bundles = state.data?.bundles || [];
  $("#bundleHistory").innerHTML = bundles.length ? bundles.map((bundle) => `
    <button class="bundle-row" data-bundle-id="${bundle.bundleId}">
      <strong>${escapeHtml(bundle.title)}</strong>
      <small>${escapeHtml(bundle.createdAt)}</small>
    </button>
  `).join("") : `<div class="empty">No bundles yet.</div>`;

  for (const button of document.querySelectorAll("[data-bundle-id]")) {
    button.addEventListener("click", async () => {
      const bundle = await api(`/api/bundles/${button.dataset.bundleId}`);
      $("#bundleOutput").textContent = bundle.promptText;
    });
  }
}

function renderAll() {
  renderIdentity();
  renderMetrics();
  renderBranchOptions();
  renderBranches();
  renderBranchDetails();
  renderTimeline();
  renderCompare();
  renderBundles();
}

async function loadState() {
  state.data = await api("/api/state");
  if (!state.selectedBranchId && state.data.branches[0]) {
    state.selectedBranchId = state.data.branches[0].branchId;
  }
  renderAll();
}

async function registerUser() {
  const user = await api("/api/users", {
    method: "POST",
    body: JSON.stringify(state.currentUser)
  });
  state.currentUser = {
    userId: user.userId,
    name: user.name,
    color: user.color
  };
  saveUser();
}

function connectEvents() {
  if (state.events) state.events.close();
  state.connectionStatus = "connecting";
  renderIdentity();

  const params = new URLSearchParams({
    userId: state.currentUser.userId,
    name: state.currentUser.name
  });
  const events = new EventSource(`/api/events?${params.toString()}`);
  state.events = events;

  events.addEventListener("connected", (event) => {
    const payload = JSON.parse(event.data);
    state.connectionStatus = "live";
    state.data = payload.state;
    renderAll();
  });

  events.addEventListener("state.changed", (event) => {
    const payload = JSON.parse(event.data);
    state.connectionStatus = "live";
    state.data = payload.state;
    renderAll();
  });

  events.addEventListener("error", () => {
    state.connectionStatus = "offline";
    renderIdentity();
  });
}

async function initializeWorkspace() {
  await api("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name: "Context Collab Workspace" })
  });
  await api("/api/branches", {
    method: "POST",
    body: JSON.stringify({ owner: state.currentUser.userId, name: "main" })
  });
  notice("Workspace initialized.");
}

async function seedDemoData() {
  await api("/api/seed-demo", { method: "POST", body: "{}" });
  notice("Demo workspace seeded.");
}

async function createBranch(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const branch = await api("/api/branches", {
    method: "POST",
    body: JSON.stringify({
      owner: form.get("owner") || state.currentUser.userId,
      name: form.get("name"),
      parentBranchId: form.get("parentBranchId") || null
    })
  });
  state.selectedBranchId = branch.branchId;
  event.currentTarget.reset();
  notice(`Branch created: ${branch.branchId}`);
}

async function addContextItem(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  await api("/api/items", {
    method: "POST",
    body: JSON.stringify({
      branchId: form.get("branchId"),
      type: form.get("type"),
      summary: form.get("summary"),
      body: form.get("body"),
      createdBy: state.currentUser.userId,
      files: String(form.get("files") || "")
        .split(",")
        .map((file) => file.trim())
        .filter(Boolean)
    })
  });
  event.currentTarget.reset();
  notice("Context item added.");
}

async function importSession(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const content = String(form.get("content") || "").trim();
  if (!content) {
    notice("Session content is required.", "error");
    return;
  }

  const result = await api("/api/session-imports", {
    method: "POST",
    body: JSON.stringify({
      branchId: form.get("branchId"),
      content,
      format: form.get("format"),
      source: form.get("source") || `session:${state.currentUser.userId}:web-ui`
    })
  });

  event.currentTarget.reset();
  notice(`Imported ${result.imported} session items.`);
}

async function previewMerge() {
  const sourceBranchIds = selectedBranchIds();
  if (sourceBranchIds.length < 2) {
    $("#mergePreview").innerHTML = `<div class="empty">Select at least two branches.</div>`;
    return;
  }

  const preview = await api("/api/merges/preview", {
    method: "POST",
    body: JSON.stringify({ sourceBranchIds })
  });
  state.lastPreview = preview;
  $("#mergePreview").innerHTML = `
    <div class="preview-head">
      <div>
        <strong>${preview.acceptedItems.length} accepted items</strong>
        <small>${escapeHtml(preview.mergeId)}</small>
      </div>
      <button id="acceptMergeBtn">Accept Merge</button>
    </div>
    ${conflictCards(preview)}
  `;
  $("#acceptMergeBtn").addEventListener("click", acceptMerge);
}

async function acceptMerge() {
  const sourceBranchIds = state.lastPreview?.sourceBranchIds || selectedBranchIds();
  const merge = await api("/api/merges", {
    method: "POST",
    body: JSON.stringify({
      sourceBranchIds,
      preview: state.lastPreview,
      acceptedBy: state.currentUser.userId
    })
  });
  notice(`Accepted merge ${merge.mergeId}.`);
}

async function createBundle() {
  const latestMerge = state.data?.merges?.[0];
  const bundle = await api("/api/bundles", {
    method: "POST",
    body: JSON.stringify({
      mergeId: latestMerge?.mergeId || null,
      title: `${state.currentUser.name}'s shared context bundle`,
      summary: "Curated context exported from Context Collab."
    })
  });
  $("#bundleOutput").textContent = bundle.promptText;
  notice(`Bundle created: ${bundle.bundleId}`);
}

async function pullBranch(sourceBranchId) {
  const branch = await api(`/api/branches/${sourceBranchId}/pull`, {
    method: "POST",
    body: JSON.stringify({
      owner: state.currentUser.userId,
      name: `${sourceBranchId}-copy`
    })
  });
  state.selectedBranchId = branch.branchId;
  notice(`Pulled ${sourceBranchId} into ${branch.branchId}.`);
}

async function pullSelectedBranch(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const sourceBranchId = form.get("sourceBranchId");
  if (!sourceBranchId) {
    notice("Select a source branch to pull.", "error");
    return;
  }
  await pullBranch(sourceBranchId);
  event.currentTarget.reset();
}

async function updateIdentity(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  state.currentUser = {
    userId: String(form.get("userId") || "").trim() || "local-user",
    name: String(form.get("name") || "").trim() || "Local User",
    color: "#177245"
  };
  await registerUser();
  connectEvents();
  notice(`Connected as ${state.currentUser.name}.`);
}

function wireEvents() {
  $("#identityForm").addEventListener("submit", updateIdentity);
  $("#initBtn").addEventListener("click", initializeWorkspace);
  $("#seedBtn").addEventListener("click", seedDemoData);
  $("#branchForm").addEventListener("submit", createBranch);
  $("#itemForm").addEventListener("submit", addContextItem);
  $("#importForm").addEventListener("submit", importSession);
  $("#pullForm").addEventListener("submit", pullSelectedBranch);
  $("#previewBtn").addEventListener("click", previewMerge);
  $("#bundleBtn").addEventListener("click", createBundle);
  $("#branchCompareSelect").addEventListener("change", renderCompare);
  $("#branchSelect").addEventListener("change", (event) => {
    state.selectedBranchId = event.target.value;
    renderBranchDetails();
    renderCompare();
    renderBranches();
  });
}

async function start() {
  wireEvents();
  await registerUser();
  await loadState();
  connectEvents();
}

start().catch((error) => {
  notice(error.message, "error");
});
