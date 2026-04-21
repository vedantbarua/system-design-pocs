const state = {
  data: null,
  lastPreview: null
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function itemCount() {
  return (state.data?.branches || []).reduce((total, branch) => total + branch.items.length, 0);
}

function selectedBranchIds() {
  return [...document.querySelectorAll("[data-branch-check]:checked")].map((input) => input.value);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMetrics() {
  const workspace = state.data?.workspace;
  const metrics = [
    ["workspace", workspace?.name || "not initialized"],
    ["branches", state.data?.branches.length || 0],
    ["items", itemCount()],
    ["merges", state.data?.merges.length || 0],
    ["bundles", state.data?.bundles.length || 0]
  ];
  document.querySelector("#metrics").innerHTML = metrics
    .map(([label, value]) => `<div class="metric"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");
}

function renderBranches() {
  const branches = state.data?.branches || [];
  document.querySelector("#branchSelect").innerHTML = branches
    .map((branch) => `<option value="${branch.branchId}">${branch.owner}/${branch.name}</option>`)
    .join("");

  document.querySelector("#branches").innerHTML = branches.length
    ? branches.map((branch) => `
      <div class="branch">
        <label class="branch-head">
          <input type="checkbox" data-branch-check value="${branch.branchId}" />
          <span>
            <strong>${escapeHtml(branch.owner)}/${escapeHtml(branch.name)}</strong>
            <small>${branch.items.length} items · base ${escapeHtml(branch.baseCommit)}</small>
          </span>
        </label>
        <div class="items">
          ${branch.items.map((item) => `
            <div class="item">
              <span class="badge">${escapeHtml(item.type)}</span>
              <p>${escapeHtml(item.summary)}</p>
              <small>${escapeHtml(item.createdBy)} · ${escapeHtml((item.files || []).join(", ") || "no files")}</small>
            </div>
          `).join("")}
        </div>
      </div>
    `).join("")
    : `<div class="empty">Initialize the workspace or seed the demo.</div>`;
}

function renderAudit() {
  const audit = state.data?.audit || [];
  document.querySelector("#audit").innerHTML = audit.length
    ? audit.map((event) => `
      <div class="audit-event">
        <strong>${escapeHtml(event.event)}</strong>
        <span>${escapeHtml(event.at)}</span>
      </div>
    `).join("")
    : `<div class="empty">No audit events yet.</div>`;
}

function renderAll() {
  renderMetrics();
  renderBranches();
  renderAudit();
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
          <small>${escapeHtml([...(row.itemIds || []), ...(row.branchIds || []), row.file, row.symbol].filter(Boolean).join(" · "))}</small>
        </div>
      `).join("") : `<div class="empty compact">None detected.</div>`}
    </div>
  `).join("");
}

async function loadState() {
  state.data = await api("/api/state");
  renderAll();
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
  await loadState();
}

async function seedDemoData() {
  await api("/api/seed-demo", { method: "POST", body: "{}" });
  await loadState();
}

async function addContextItem(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = {
    branchId: form.get("branchId"),
    type: form.get("type"),
    summary: form.get("summary"),
    body: form.get("body"),
    files: String(form.get("files") || "").split(",").map((file) => file.trim()).filter(Boolean)
  };
  await api("/api/items", { method: "POST", body: JSON.stringify(payload) });
  event.currentTarget.reset();
  await loadState();
}

async function previewMerge() {
  const sourceBranchIds = selectedBranchIds();
  if (sourceBranchIds.length < 2) {
    document.querySelector("#mergePreview").textContent = "Select at least two branches.";
    return;
  }
  const preview = await api("/api/merges/preview", {
    method: "POST",
    body: JSON.stringify({ sourceBranchIds })
  });
  state.lastPreview = preview;
  document.querySelector("#mergePreview").innerHTML = `
    <div class="preview-head">
      <div>
        <strong>${preview.acceptedItems.length} accepted items</strong>
        <small>${escapeHtml(preview.mergeId)}</small>
      </div>
      <button id="acceptMergeBtn">Accept Merge</button>
    </div>
    ${conflictCards(preview)}
  `;
  document.querySelector("#acceptMergeBtn").addEventListener("click", acceptMerge);
}

async function acceptMerge() {
  const sourceBranchIds = state.lastPreview?.sourceBranchIds || selectedBranchIds();
  const merge = await api("/api/merges", {
    method: "POST",
    body: JSON.stringify({ sourceBranchIds, preview: state.lastPreview, acceptedBy: "web-ui" })
  });
  document.querySelector("#mergePreview").insertAdjacentHTML("afterbegin", `<div class="notice">Accepted ${escapeHtml(merge.mergeId)}</div>`);
  await loadState();
}

async function createBundle() {
  const latestMerge = state.data?.merges?.[0];
  const bundle = await api("/api/bundles", {
    method: "POST",
    body: JSON.stringify({
      mergeId: latestMerge?.mergeId,
      title: "Assistant-ready shared context",
      summary: "Curated context exported from Context Collab."
    })
  });
  document.querySelector("#bundleOutput").textContent = bundle.promptText;
  await loadState();
}

document.querySelector("#initBtn").addEventListener("click", initializeWorkspace);
document.querySelector("#seedBtn").addEventListener("click", seedDemoData);
document.querySelector("#itemForm").addEventListener("submit", addContextItem);
document.querySelector("#previewBtn").addEventListener("click", previewMerge);
document.querySelector("#bundleBtn").addEventListener("click", createBundle);

loadState().catch((error) => {
  document.querySelector("#metrics").innerHTML = `<div class="notice error">${escapeHtml(error.message)}</div>`;
});
