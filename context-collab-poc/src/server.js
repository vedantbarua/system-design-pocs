import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  acceptMerge,
  addItem,
  createBranch,
  createBundle,
  getState,
  importSessionContent,
  initWorkspace,
  listBranches,
  listBundles,
  listItems,
  listMerges,
  listUsers,
  loadBranch,
  loadBundle,
  loadMerge,
  loadWorkspace,
  previewMerge,
  pullBranch,
  seedDemo,
  upsertUser
} from "./lib/store.js";

const PORT = Number(process.env.PORT || 4100);
const HOST = process.env.HOST || "127.0.0.1";
const REPO_ROOT = path.resolve(process.env.CONTEXT_COLLAB_REPO || process.cwd());
const PUBLIC_DIR = path.resolve(new URL("../public", import.meta.url).pathname);

const clients = new Map();
const presence = new Map();

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body, null, 2));
}

function sendText(res, status, body, contentType = "text/plain") {
  res.writeHead(status, { "content-type": contentType });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function notFound(res, message = "Resource not found") {
  sendJson(res, 404, { error: message });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const fileName = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const absolute = path.join(PUBLIC_DIR, fileName);
  if (!absolute.startsWith(PUBLIC_DIR) || !fs.existsSync(absolute)) {
    sendText(res, 404, "Not found");
    return;
  }
  const ext = path.extname(absolute);
  const contentType = ext === ".css" ? "text/css" : ext === ".js" ? "text/javascript" : "text/html";
  sendText(res, 200, fs.readFileSync(absolute, "utf8"), contentType);
}

function currentState() {
  const state = getState(REPO_ROOT);
  return {
    ...state,
    users: listUsers(REPO_ROOT),
    presence: [...presence.values()].sort((a, b) => a.name.localeCompare(b.name))
  };
}

function broadcast(event, payload) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients.values()) {
    client.res.write(chunk);
  }
}

function broadcastState(reason, detail = {}) {
  broadcast("state.changed", {
    reason,
    detail,
    state: currentState()
  });
}

function registerPresence(query) {
  const userId = String(query.get("userId") || "guest").trim() || "guest";
  const name = String(query.get("name") || userId).trim() || userId;
  const clientId = crypto.randomBytes(8).toString("hex");
  const record = {
    clientId,
    userId,
    name,
    connectedAt: new Date().toISOString()
  };
  presence.set(clientId, record);
  broadcastState("presence.joined", { userId, name });
  return record;
}

function handleEvents(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const record = registerPresence(url.searchParams);

  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId: record.clientId, state: currentState() })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  }, 15000);

  clients.set(record.clientId, { res, heartbeat, userId: record.userId, name: record.name });

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(record.clientId);
    presence.delete(record.clientId);
    broadcastState("presence.left", { userId: record.userId, name: record.name });
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.split("/").filter(Boolean);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { status: "ok", repoRoot: REPO_ROOT });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, currentState());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/presence") {
      sendJson(res, 200, [...presence.values()]);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/users") {
      sendJson(res, 200, listUsers(REPO_ROOT));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/users") {
      const body = await readBody(req);
      const user = upsertUser(REPO_ROOT, body);
      sendJson(res, 201, user);
      broadcastState("user.updated", { userId: user.userId });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/workspaces") {
      const state = currentState();
      sendJson(res, 200, state.workspace ? [state.workspace] : []);
      return;
    }

    if (req.method === "GET" && segments[0] === "api" && segments[1] === "workspaces" && segments[2]) {
      const workspace = loadWorkspace(REPO_ROOT);
      if (segments[2] !== workspace.workspaceId) {
        notFound(res, `Workspace not found: ${segments[2]}`);
        return;
      }
      sendJson(res, 200, workspace);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/workspaces") {
      const body = await readBody(req);
      const workspace = initWorkspace(body.repositoryRoot || REPO_ROOT, body);
      sendJson(res, 201, workspace);
      broadcastState("workspace.updated", { workspaceId: workspace.workspaceId });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/branches") {
      sendJson(res, 200, listBranches(REPO_ROOT));
      return;
    }

    if (req.method === "GET" && segments[0] === "api" && segments[1] === "branches" && segments[2] && segments.length === 3) {
      sendJson(res, 200, loadBranch(REPO_ROOT, segments[2]));
      return;
    }

    if (req.method === "GET" && segments[0] === "api" && segments[1] === "branches" && segments[2] && segments[3] === "items") {
      sendJson(res, 200, listItems(REPO_ROOT, segments[2]));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/branches") {
      const body = await readBody(req);
      const branch = createBranch(REPO_ROOT, body);
      sendJson(res, 201, branch);
      broadcastState("branch.created", { branchId: branch.branchId });
      return;
    }

    if (req.method === "POST" && segments[0] === "api" && segments[1] === "branches" && segments[2] && segments[3] === "pull") {
      const body = await readBody(req);
      const branch = pullBranch(REPO_ROOT, segments[2], body);
      sendJson(res, 201, branch);
      broadcastState("branch.pulled", { branchId: branch.branchId, sourceBranchId: segments[2] });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/items") {
      const body = await readBody(req);
      const item = addItem(REPO_ROOT, body.branchId, body);
      sendJson(res, 201, item);
      broadcastState("item.added", { branchId: body.branchId, itemId: item.itemId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/session-imports") {
      const body = await readBody(req);
      const imported = importSessionContent(REPO_ROOT, body.branchId, body.content || "", {
        source: body.source || "session:web-ui",
        format: body.format,
        sessionPath: body.sessionPath
      });
      sendJson(res, 201, { imported: imported.length, items: imported });
      broadcastState("session.imported", { branchId: body.branchId, imported: imported.length });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/merges") {
      sendJson(res, 200, listMerges(REPO_ROOT));
      return;
    }

    if (req.method === "GET" && segments[0] === "api" && segments[1] === "merges" && segments[2]) {
      sendJson(res, 200, loadMerge(REPO_ROOT, segments[2]));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/merges/preview") {
      const body = await readBody(req);
      sendJson(res, 200, previewMerge(REPO_ROOT, body.sourceBranchIds || [], body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/merges") {
      const body = await readBody(req);
      const merge = acceptMerge(REPO_ROOT, body.sourceBranchIds || [], body);
      sendJson(res, 201, merge);
      broadcastState("merge.accepted", { mergeId: merge.mergeId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bundles") {
      const body = await readBody(req);
      const bundle = createBundle(REPO_ROOT, body);
      sendJson(res, 201, bundle);
      broadcastState("bundle.created", { bundleId: bundle.bundleId });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/bundles") {
      sendJson(res, 200, listBundles(REPO_ROOT));
      return;
    }

    if (req.method === "GET" && segments[0] === "api" && segments[1] === "bundles" && segments[2] && segments.length === 3) {
      sendJson(res, 200, loadBundle(REPO_ROOT, segments[2]));
      return;
    }

    if (req.method === "GET" && segments[0] === "api" && segments[1] === "bundles" && segments[2] && segments[3] === "prompt") {
      const bundle = loadBundle(REPO_ROOT, segments[2]);
      sendText(res, 200, bundle.promptText, "text/markdown; charset=utf-8");
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/seed-demo") {
      const seeded = seedDemo(REPO_ROOT);
      sendJson(res, 201, seeded);
      broadcastState("demo.seeded", {});
      return;
    }

    sendJson(res, 404, { error: "API route not found" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/events")) {
    handleEvents(req, res);
  } else if (req.url.startsWith("/api/")) {
    handleApi(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Context Collab POC listening on http://${HOST}:${PORT}`);
  console.log(`Using repository workspace: ${REPO_ROOT}`);
});
