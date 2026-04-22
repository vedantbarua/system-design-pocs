import http from "node:http";
import fs from "node:fs";
import path from "node:path";
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
  loadBranch,
  loadBundle,
  loadMerge,
  loadWorkspace,
  previewMerge,
  seedDemo
} from "./lib/store.js";

const PORT = Number(process.env.PORT || 4100);
const HOST = process.env.HOST || "127.0.0.1";
const REPO_ROOT = path.resolve(process.env.CONTEXT_COLLAB_REPO || process.cwd());
const PUBLIC_DIR = path.resolve(new URL("../public", import.meta.url).pathname);

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

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const segments = url.pathname.split("/").filter(Boolean);

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { status: "ok", repoRoot: REPO_ROOT });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, getState(REPO_ROOT));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/workspaces") {
      const state = getState(REPO_ROOT);
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
      sendJson(res, 201, createBranch(REPO_ROOT, body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/items") {
      const body = await readBody(req);
      sendJson(res, 201, addItem(REPO_ROOT, body.branchId, body));
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
      sendJson(res, 201, acceptMerge(REPO_ROOT, body.sourceBranchIds || [], body));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/bundles") {
      const body = await readBody(req);
      sendJson(res, 201, createBundle(REPO_ROOT, body));
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
      sendJson(res, 201, seedDemo(REPO_ROOT));
      return;
    }

    sendJson(res, 404, { error: "API route not found" });
  } catch (error) {
    sendJson(res, 400, { error: error.message });
  }
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
  } else {
    serveStatic(req, res);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Context Collab POC listening on http://${HOST}:${PORT}`);
  console.log(`Using repository workspace: ${REPO_ROOT}`);
});
