import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

export const ITEM_TYPES = new Set([
  "finding",
  "assumption",
  "decision",
  "todo",
  "risk",
  "question",
  "patch-summary",
  "file-note",
  "prompt-snippet"
]);

const DEFAULT_DIR = ".context-collab";

function now() {
  return new Date().toISOString();
}

function slug(value) {
  return String(value || "context")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "context";
}

function id(prefix, value = "") {
  const digest = crypto.createHash("sha1").update(`${value}:${Date.now()}:${Math.random()}`).digest("hex").slice(0, 10);
  return `${prefix}-${digest}`;
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text) {
  return new Set(normalize(text).split(" ").filter((token) => token.length > 3));
}

function intersectionSize(a, b) {
  let count = 0;
  for (const item of a) {
    if (b.has(item)) count += 1;
  }
  return count;
}

function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = intersectionSize(a, b);
  return intersection / (a.size + b.size - intersection);
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function contextDir(repoRoot) {
  return path.join(path.resolve(repoRoot), process.env.CONTEXT_COLLAB_DATA_DIR || DEFAULT_DIR);
}

export function paths(repoRoot) {
  const base = contextDir(repoRoot);
  return {
    base,
    workspace: path.join(base, "workspace.json"),
    branches: path.join(base, "branches"),
    merges: path.join(base, "merges"),
    bundles: path.join(base, "bundles"),
    audit: path.join(base, "audit.jsonl")
  };
}

export function getGitMetadata(repoRoot) {
  const resolved = path.resolve(repoRoot);
  const metadata = {
    repositoryRoot: resolved,
    repositoryRemote: "local",
    defaultBranch: "main",
    headCommit: "unknown"
  };

  try {
    metadata.headCommit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: resolved,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
    metadata.headCommit = "no-git";
  }

  try {
    metadata.repositoryRemote = execFileSync("git", ["config", "--get", "remote.origin.url"], {
      cwd: resolved,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim() || "local";
  } catch {
    metadata.repositoryRemote = "local";
  }

  try {
    metadata.defaultBranch = execFileSync("git", ["branch", "--show-current"], {
      cwd: resolved,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim() || "main";
  } catch {
    metadata.defaultBranch = "main";
  }

  return metadata;
}

export function appendAudit(repoRoot, event) {
  const allPaths = paths(repoRoot);
  fs.mkdirSync(path.dirname(allPaths.audit), { recursive: true });
  fs.appendFileSync(allPaths.audit, `${JSON.stringify({ ...event, at: now() })}\n`);
}

export function initWorkspace(repoRoot, options = {}) {
  const resolved = path.resolve(repoRoot);
  const allPaths = paths(resolved);
  fs.mkdirSync(allPaths.branches, { recursive: true });
  fs.mkdirSync(allPaths.merges, { recursive: true });
  fs.mkdirSync(allPaths.bundles, { recursive: true });

  const git = getGitMetadata(resolved);
  const existing = readJson(allPaths.workspace, null);
  const workspace = existing || {
    workspaceId: options.workspaceId || `ws-${slug(options.name || path.basename(resolved))}`,
    name: options.name || path.basename(resolved),
    repositoryRemote: options.repositoryRemote || git.repositoryRemote,
    repositoryRoot: resolved,
    defaultBranch: options.defaultBranch || git.defaultBranch,
    baseCommit: git.headCommit,
    createdAt: now()
  };

  workspace.updatedAt = now();
  workspace.repositoryRoot = resolved;
  workspace.currentHead = git.headCommit;
  writeJson(allPaths.workspace, workspace);
  appendAudit(resolved, { event: "workspace.initialized", workspaceId: workspace.workspaceId });
  return workspace;
}

export function loadWorkspace(repoRoot) {
  const workspace = readJson(paths(repoRoot).workspace, null);
  if (!workspace) {
    throw new Error(`No Context Collab workspace found in ${contextDir(repoRoot)}. Run init first.`);
  }
  return workspace;
}

export function branchFile(repoRoot, branchId) {
  return path.join(paths(repoRoot).branches, `${branchId}.json`);
}

export function createBranch(repoRoot, options = {}) {
  const workspace = loadWorkspace(repoRoot);
  const owner = options.owner || process.env.USER || "local";
  const name = options.name || "main";
  const branchId = options.branchId || `${slug(owner)}-${slug(name)}`;
  const existing = readJson(branchFile(repoRoot, branchId), null);
  if (existing) return existing;

  const branch = {
    branchId,
    workspaceId: workspace.workspaceId,
    name,
    owner,
    baseCommit: options.baseCommit || getGitMetadata(repoRoot).headCommit,
    parentBranchId: options.parentBranchId || null,
    createdAt: now(),
    updatedAt: now(),
    items: []
  };
  writeJson(branchFile(repoRoot, branchId), branch);
  appendAudit(repoRoot, { event: "branch.created", branchId, owner, name });
  return branch;
}

export function listBranches(repoRoot) {
  const allPaths = paths(repoRoot);
  if (!fs.existsSync(allPaths.branches)) return [];
  return fs.readdirSync(allPaths.branches)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(allPaths.branches, file), null))
    .filter(Boolean)
    .sort((a, b) => a.branchId.localeCompare(b.branchId));
}

export function loadBranch(repoRoot, branchId) {
  const branch = readJson(branchFile(repoRoot, branchId), null);
  if (!branch) throw new Error(`Branch not found: ${branchId}`);
  return branch;
}

export function saveBranch(repoRoot, branch) {
  branch.updatedAt = now();
  writeJson(branchFile(repoRoot, branch.branchId), branch);
}

export function addItem(repoRoot, branchId, input) {
  const branch = loadBranch(repoRoot, branchId);
  const type = input.type || "finding";
  if (!ITEM_TYPES.has(type)) {
    throw new Error(`Unsupported context item type: ${type}`);
  }
  const summary = String(input.summary || "").trim();
  if (!summary) {
    throw new Error("Context item summary is required.");
  }

  const item = {
    itemId: input.itemId || id("item", summary),
    branchId,
    type,
    summary,
    body: input.body || "",
    files: Array.isArray(input.files) ? input.files.filter(Boolean) : [],
    symbols: Array.isArray(input.symbols) ? input.symbols.filter(Boolean) : [],
    confidence: input.confidence || "medium",
    source: input.source || "manual",
    createdBy: input.createdBy || branch.owner,
    createdAt: input.createdAt || now(),
    supersedes: input.supersedes || null
  };

  branch.items.push(item);
  saveBranch(repoRoot, branch);
  appendAudit(repoRoot, { event: "item.added", branchId, itemId: item.itemId, type: item.type });
  return item;
}

export function listItems(repoRoot, branchId) {
  return loadBranch(repoRoot, branchId).items;
}

export function importSession(repoRoot, branchId, sessionPath) {
  const content = fs.readFileSync(sessionPath, "utf8");
  const imported = [];

  function addImported(summary, body, type = "prompt-snippet") {
    imported.push(addItem(repoRoot, branchId, {
      type,
      summary,
      body,
      confidence: "medium",
      source: `session:${path.basename(sessionPath)}`
    }));
  }

  if (sessionPath.endsWith(".jsonl")) {
    const lines = content.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      try {
        const event = JSON.parse(line);
        const text = event.summary || event.message || event.content || event.text;
        if (text) addImported(String(text).slice(0, 120), String(text));
      } catch {
        if (line.length > 20) addImported(line.slice(0, 120), line);
      }
    }
  } else {
    try {
      const parsed = JSON.parse(content);
      const records = Array.isArray(parsed) ? parsed : parsed.items || parsed.messages || [parsed];
      for (const record of records) {
        const text = record.summary || record.message || record.content || record.text || JSON.stringify(record);
        const type = ITEM_TYPES.has(record.type) ? record.type : "prompt-snippet";
        addImported(String(text).slice(0, 120), String(text), type);
      }
    } catch {
      const chunks = content.split(/\n\s*\n/).filter((chunk) => chunk.trim().length > 20);
      for (const chunk of chunks.slice(0, 20)) {
        addImported(chunk.trim().slice(0, 120), chunk.trim());
      }
    }
  }

  appendAudit(repoRoot, { event: "session.imported", branchId, sessionPath, itemCount: imported.length });
  return imported;
}

function sameFileOverlap(a, b) {
  const aFiles = new Set(a.files || []);
  const bFiles = new Set(b.files || []);
  return intersectionSize(aFiles, bFiles) > 0;
}

function hasNegation(text) {
  return /\b(no|not|never|disable|disabled|avoid|skip|without|out of scope)\b/i.test(text);
}

function hasPositiveIntent(text) {
  return /\b(use|uses|enable|enabled|should|must|required|in scope|modify|update|add)\b/i.test(text);
}

function allPairs(items) {
  const pairs = [];
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      pairs.push([items[i], items[j]]);
    }
  }
  return pairs;
}

export function previewMerge(repoRoot, sourceBranchIds, options = {}) {
  const branches = sourceBranchIds.map((branchId) => loadBranch(repoRoot, branchId));
  const items = branches.flatMap((branch) => branch.items.map((item) => ({ ...item, fromBranchId: branch.branchId })));
  const currentHead = getGitMetadata(repoRoot).headCommit;
  const duplicateItems = [];
  const conflicts = [];
  const staleReferences = [];

  for (const [a, b] of allPairs(items)) {
    const sameType = a.type === b.type;
    const sameSummary = normalize(a.summary) === normalize(b.summary);
    const overlap = jaccard(tokenSet(a.summary), tokenSet(b.summary));
    if (sameType && (sameSummary || (overlap >= 0.72 && sameFileOverlap(a, b)))) {
      duplicateItems.push({
        type: "duplicate",
        itemIds: [a.itemId, b.itemId],
        branchIds: [a.fromBranchId, b.fromBranchId],
        reason: "same type with matching summary or high token overlap"
      });
    }

    const contradictionTypes = new Set(["assumption", "decision", "todo", "patch-summary"]);
    if (sameFileOverlap(a, b) && contradictionTypes.has(a.type) && contradictionTypes.has(b.type)) {
      const aText = `${a.summary} ${a.body}`;
      const bText = `${b.summary} ${b.body}`;
      if ((hasNegation(aText) && hasPositiveIntent(bText)) || (hasNegation(bText) && hasPositiveIntent(aText))) {
        conflicts.push({
          type: "contradiction",
          itemIds: [a.itemId, b.itemId],
          branchIds: [a.fromBranchId, b.fromBranchId],
          files: [...new Set([...(a.files || []), ...(b.files || [])])],
          reason: "same file reference with incompatible positive and negative intent"
        });
      }
    }

    if (sameFileOverlap(a, b) && ["todo", "patch-summary"].includes(a.type) && ["todo", "patch-summary"].includes(b.type) && a.createdBy !== b.createdBy) {
      conflicts.push({
        type: "ownership-collision",
        itemIds: [a.itemId, b.itemId],
        branchIds: [a.fromBranchId, b.fromBranchId],
        files: [...new Set((a.files || []).filter((file) => (b.files || []).includes(file)))],
        reason: "multiple owners are planning work on the same file"
      });
    }
  }

  for (const branch of branches) {
    if (branch.baseCommit && branch.baseCommit !== "no-git" && currentHead !== "no-git" && branch.baseCommit !== currentHead) {
      staleReferences.push({
        type: "base-commit-drift",
        branchId: branch.branchId,
        expected: branch.baseCommit,
        actual: currentHead,
        reason: "branch context was captured against a different repository commit"
      });
    }
  }

  for (const item of items) {
    for (const file of item.files || []) {
      if (!fs.existsSync(path.join(repoRoot, file))) {
        staleReferences.push({
          type: "missing-file",
          itemId: item.itemId,
          branchId: item.fromBranchId,
          file,
          reason: "referenced file does not exist in the current repository"
        });
      }
    }
    for (const symbol of item.symbols || []) {
      const exists = (item.files || []).some((file) => {
        const absolute = path.join(repoRoot, file);
        return fs.existsSync(absolute) && fs.readFileSync(absolute, "utf8").includes(symbol);
      });
      if ((item.files || []).length > 0 && !exists) {
        staleReferences.push({
          type: "missing-symbol",
          itemId: item.itemId,
          branchId: item.fromBranchId,
          symbol,
          reason: "referenced symbol was not found in the item files"
        });
      }
    }
  }

  const duplicateIds = new Set(duplicateItems.flatMap((duplicate) => duplicate.itemIds.slice(1)));
  const acceptedItems = items.filter((item) => !duplicateIds.has(item.itemId));
  const preview = {
    mergeId: options.mergeId || id("merge", sourceBranchIds.join("-")),
    sourceBranchIds,
    targetBranchId: options.targetBranchId || null,
    acceptedItems,
    duplicateItems,
    conflicts,
    staleReferences,
    generatedAt: now()
  };
  return preview;
}

export function acceptMerge(repoRoot, sourceBranchIds, options = {}) {
  const preview = options.preview || previewMerge(repoRoot, sourceBranchIds, options);
  const allPaths = paths(repoRoot);
  const merge = {
    ...preview,
    status: "accepted",
    acceptedBy: options.acceptedBy || process.env.USER || "local",
    acceptedAt: now()
  };
  writeJson(path.join(allPaths.merges, `${merge.mergeId}.json`), merge);
  appendAudit(repoRoot, { event: "merge.accepted", mergeId: merge.mergeId, sourceBranchIds });
  return merge;
}

export function listMerges(repoRoot) {
  const allPaths = paths(repoRoot);
  if (!fs.existsSync(allPaths.merges)) return [];
  return fs.readdirSync(allPaths.merges)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(allPaths.merges, file), null))
    .filter(Boolean)
    .sort((a, b) => String(b.acceptedAt || b.generatedAt).localeCompare(String(a.acceptedAt || a.generatedAt)));
}

export function createBundle(repoRoot, input = {}) {
  const workspace = loadWorkspace(repoRoot);
  const merge = input.mergeId ? listMerges(repoRoot).find((candidate) => candidate.mergeId === input.mergeId) : null;
  const items = merge ? merge.acceptedItems : listBranches(repoRoot).flatMap((branch) => branch.items.map((item) => ({ ...item, fromBranchId: branch.branchId })));
  const includedItems = items.filter((item) => !input.types || input.types.includes(item.type));
  const title = input.title || `Context bundle ${new Date().toISOString().slice(0, 10)}`;
  const summary = input.summary || `Curated context for ${workspace.name}.`;
  const promptText = renderPrompt({ workspace, title, summary, items: includedItems, merge });
  const bundle = {
    bundleId: input.bundleId || id("bundle", title),
    workspaceId: workspace.workspaceId,
    sourceMergeId: merge?.mergeId || null,
    title,
    summary,
    includedItems,
    promptText,
    createdAt: now()
  };
  writeJson(path.join(paths(repoRoot).bundles, `${bundle.bundleId}.json`), bundle);
  fs.writeFileSync(path.join(paths(repoRoot).bundles, `${bundle.bundleId}.prompt.md`), promptText);
  appendAudit(repoRoot, { event: "bundle.created", bundleId: bundle.bundleId, itemCount: includedItems.length });
  return bundle;
}

export function listBundles(repoRoot) {
  const allPaths = paths(repoRoot);
  if (!fs.existsSync(allPaths.bundles)) return [];
  return fs.readdirSync(allPaths.bundles)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson(path.join(allPaths.bundles, file), null))
    .filter(Boolean)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function loadBundle(repoRoot, bundleId) {
  const bundle = readJson(path.join(paths(repoRoot).bundles, `${bundleId}.json`), null);
  if (!bundle) throw new Error(`Bundle not found: ${bundleId}`);
  return bundle;
}

export function renderPrompt({ workspace, title, summary, items, merge }) {
  const lines = [
    `# ${title}`,
    "",
    summary,
    "",
    "## Repository",
    `- Workspace: ${workspace.name}`,
    `- Remote: ${workspace.repositoryRemote}`,
    `- Base commit: ${workspace.baseCommit || "unknown"}`,
    ""
  ];

  if (merge) {
    lines.push("## Merge Context", `- Merge: ${merge.mergeId}`, `- Branches: ${merge.sourceBranchIds.join(", ")}`, "");
  }

  lines.push("## Context Items");
  for (const item of items) {
    lines.push(
      `- [${item.type}] ${item.summary}`,
      `  - Confidence: ${item.confidence}`,
      `  - Source: ${item.source}`,
      `  - Provenance: ${item.createdBy} via ${item.fromBranchId || item.branchId}`,
      `  - Files: ${(item.files || []).join(", ") || "none"}`
    );
    if (item.body) lines.push(`  - Detail: ${item.body}`);
  }
  lines.push("", "## Instructions", "Use this as durable working context. Treat conflicts and stale references as review targets before changing code.");
  return `${lines.join("\n")}\n`;
}

export function readAudit(repoRoot) {
  const auditPath = paths(repoRoot).audit;
  if (!fs.existsSync(auditPath)) return [];
  return fs.readFileSync(auditPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function getState(repoRoot) {
  let workspace = null;
  try {
    workspace = loadWorkspace(repoRoot);
  } catch {
    return { workspace: null, branches: [], merges: [], bundles: [], audit: [] };
  }
  return {
    workspace,
    branches: listBranches(repoRoot),
    merges: listMerges(repoRoot),
    bundles: listBundles(repoRoot),
    audit: readAudit(repoRoot).slice(-50).reverse()
  };
}

export function seedDemo(repoRoot) {
  const workspace = initWorkspace(repoRoot, { name: "Context Collab Demo" });
  const maya = createBranch(repoRoot, { owner: "maya", name: "auth-routing" });
  const jordan = createBranch(repoRoot, { owner: "jordan", name: "rate-limit-fix" });

  if (maya.items.length === 0) {
    addItem(repoRoot, maya.branchId, {
      type: "finding",
      summary: "Route predicates are evaluated before auth policy lookup.",
      body: "The merge should preserve this ordering note for future assistant sessions.",
      files: ["README.md"],
      confidence: "high",
      createdBy: "maya"
    });
    addItem(repoRoot, maya.branchId, {
      type: "assumption",
      summary: "Do not modify the rate limit middleware in the auth routing pass.",
      files: ["src/middleware/rate-limit.ts"],
      confidence: "medium",
      createdBy: "maya"
    });
    addItem(repoRoot, maya.branchId, {
      type: "todo",
      summary: "Update README.md with accepted auth routing context.",
      files: ["README.md"],
      confidence: "high",
      createdBy: "maya"
    });
  }

  if (jordan.items.length === 0) {
    addItem(repoRoot, jordan.branchId, {
      type: "finding",
      summary: "Route predicates are evaluated before auth policy lookup.",
      files: ["README.md"],
      confidence: "high",
      createdBy: "jordan"
    });
    addItem(repoRoot, jordan.branchId, {
      type: "patch-summary",
      summary: "Update the rate limit middleware to run before expensive route checks.",
      files: ["src/middleware/rate-limit.ts"],
      confidence: "medium",
      createdBy: "jordan"
    });
    addItem(repoRoot, jordan.branchId, {
      type: "todo",
      summary: "Update README.md with bundle export steps.",
      files: ["README.md"],
      confidence: "medium",
      createdBy: "jordan"
    });
  }

  const preview = previewMerge(repoRoot, [maya.branchId, jordan.branchId]);
  const merge = acceptMerge(repoRoot, [maya.branchId, jordan.branchId], { preview, acceptedBy: "demo" });
  const bundle = createBundle(repoRoot, {
    mergeId: merge.mergeId,
    title: "Merged auth routing context",
    summary: "Merged context from auth routing and rate limit investigations."
  });

  return {
    workspace,
    branches: [loadBranch(repoRoot, maya.branchId), loadBranch(repoRoot, jordan.branchId)],
    merge,
    bundle
  };
}
