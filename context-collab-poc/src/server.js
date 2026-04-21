import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import {
  acceptMerge,
  addItem,
  createBranch,
  createBundle,
  getState,
  initWorkspace,
  previewMerge,
  seedDemo
} from "./lib/store.js";

const PORT = Number(process.env.PORT || 4100);
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

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { status: "ok", repoRoot: REPO_ROOT });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, getState(REPO_ROOT));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/workspaces") {
      const body = await readBody(req);
      const workspace = initWorkspace(body.repositoryRoot || REPO_ROOT, body);
      sendJson(res, 201, workspace);
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

server.listen(PORT, () => {
  console.log(`Context Collab POC listening on http://localhost:${PORT}`);
  console.log(`Using repository workspace: ${REPO_ROOT}`);
});
