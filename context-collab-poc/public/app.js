const state = {
  data: null,
  selectedBranchId: null,
  lastPreview: null
};

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

function renderMetrics() {
  const workspace = state.data?.workspace;
  const metrics = [
    ["workspace", workspace?.name || "not initialized"],
    ["branches", state.data?.branches.length || 0],
    ["items", itemCount()],
    ["merges", state.data?.merges.length || 0],
    ["bundles", state.data?.bundles.length || 0],
    ["head", workspace?.currentHead || "no-git"]
  ];

  $("#metrics").innerHTML = metrics.map(([label, value]) => `
    <div class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");
}

function renderBranchOptions() {
  const branches = state.data?.branches || [];
  const options = branches.map((branch) => `
    <option value="${branch.branchId}" ${branch.branchId === state.selectedBranchId ? "selected" : ""}>
      ${escapeHtml(branch.owner)}/${escapeHtml(branch.name)}
    </option>
  `).join("");

  $("#itemBranchSelect").innerHTML = options;
  $("#importBranchSelect").innerHTML = options;
  $("#branchSelect").innerHTML = options;
  $("#branchCompareSelect").innerHTML = `<option value="">Select a branch</option>${options}`;

  if (!state.selectedBranchId && branches[0]) {
    state.selectedBranchId = branches[0].branchId;
  }
}

function renderBranches() {
  const branches = state.data?.branches || [];
  $("#branches").innerHTML = branches.length ? branches.map((branch) => `
    <article class="branch ${branch.branchId === state.selectedBranchId ? "active" : ""}" data-branch-card="${branch.branchId}">
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
            <small>${escapeHtml((item.files || []).join(", ") || "no files")}</small>
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
      <small>${escapeHtml(branch.updatedAt)}</small>
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
            event.mergeId,
            event.bundleId,
            event.workspaceId,
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

function notice(message, type = "success") {
  $("#notice").innerHTML = `<div class="notice ${type === "error" ? "error" : ""}">${escapeHtml(message)}</div>`;
}

async function initializeWorkspace() {
  await api("/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name: "Context Collab Workspace" })
  });
  await api("/api/branches", {
    method: "POST",
    body: JSON.stringify({ owner: "local", name: "main" })
  });
  notice("Workspace initialized.");
  await loadState();
}

async function seedDemoData() {
  await api("/api/seed-demo", { method: "POST", body: "{}" });
  notice("Demo workspace seeded.");
  await loadState();
}

async function createBranch(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const branch = await api("/api/branches", {
    method: "POST",
    body: JSON.stringify({
      owner: form.get("owner"),
      name: form.get("name"),
      parentBranchId: form.get("parentBranchId") || null
    })
  });
  state.selectedBranchId = branch.branchId;
  event.currentTarget.reset();
  notice(`Branch created: ${branch.branchId}`);
  await loadState();
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
      files: String(form.get("files") || "")
        .split(",")
        .map((file) => file.trim())
        .filter(Boolean)
    })
  });
  event.currentTarget.reset();
  notice("Context item added.");
  await loadState();
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
      source: form.get("source") || "session:web-ui"
    })
  });

  event.currentTarget.reset();
  notice(`Imported ${result.imported} session items.`);
  await loadState();
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
      acceptedBy: "web-ui"
    })
  });
  notice(`Accepted merge ${merge.mergeId}.`);
  await loadState();
}

async function createBundle() {
  const latestMerge = state.data?.merges?.[0];
  const bundle = await api("/api/bundles", {
    method: "POST",
    body: JSON.stringify({
      mergeId: latestMerge?.mergeId || null,
      title: "Assistant-ready shared context",
      summary: "Curated context exported from Context Collab."
    })
  });
  $("#bundleOutput").textContent = bundle.promptText;
  notice(`Bundle created: ${bundle.bundleId}`);
  await loadState();
}

function wireEvents() {
  $("#initBtn").addEventListener("click", initializeWorkspace);
  $("#seedBtn").addEventListener("click", seedDemoData);
  $("#branchForm").addEventListener("submit", createBranch);
  $("#itemForm").addEventListener("submit", addContextItem);
  $("#importForm").addEventListener("submit", importSession);
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

wireEvents();
loadState().catch((error) => {
  notice(error.message, "error");
});
