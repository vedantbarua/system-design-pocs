import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import cors from "cors";
import { WebSocketServer } from "ws";
import swaggerUi from "swagger-ui-express";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8110;
const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const openapiSpec = JSON.parse(
  fs.readFileSync(new URL("./openapi.json", import.meta.url), "utf-8")
);

const boards = new Map();

function getBoard(boardId) {
  if (!boards.has(boardId)) {
    boards.set(boardId, {
      id: boardId,
      strokes: [],
      users: new Map()
    });
  }
  return boards.get(boardId);
}

function getUserList(board) {
  return Array.from(board.users.values()).map(({ id, name, color }) => ({ id, name, color }));
}

function broadcast(board, payload, excludeId = null) {
  const message = JSON.stringify(payload);
  for (const [clientId, client] of board.users.entries()) {
    if (excludeId && clientId === excludeId) continue;
    if (client.socket.readyState === client.socket.OPEN) {
      client.socket.send(message);
    }
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec));

app.get("/api/boards/:id", (req, res) => {
  const board = getBoard(req.params.id);
  res.json({
    id: board.id,
    strokes: board.strokes,
    users: getUserList(board)
  });
});

app.post("/api/boards/:id/clear", (req, res) => {
  const board = getBoard(req.params.id);
  board.strokes = [];
  broadcast(board, { type: "board:clear" });
  res.json({ ok: true });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on("connection", (socket, request) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const boardId = url.searchParams.get("boardId") || "default";
  const name = url.searchParams.get("name") || "Guest";
  const color = url.searchParams.get("color") || "#2d7ff9";

  const board = getBoard(boardId);
  const clientId = crypto.randomUUID();

  board.users.set(clientId, { id: clientId, name, color, socket });

  socket.send(
    JSON.stringify({
      type: "init",
      boardId,
      clientId,
      strokes: board.strokes,
      users: getUserList(board)
    })
  );

  broadcast(board, { type: "presence:update", users: getUserList(board) }, clientId);

  socket.on("message", (data) => {
    let payload;
    try {
      payload = JSON.parse(data.toString());
    } catch (error) {
      return;
    }

    if (!payload || typeof payload.type !== "string") return;

    if (payload.type === "stroke:add") {
      const stroke = payload.stroke;
      if (!stroke || !Array.isArray(stroke.points) || stroke.points.length < 2) return;
      const normalized = {
        id: stroke.id || crypto.randomUUID(),
        points: stroke.points,
        color: stroke.color || color,
        width: Number(stroke.width || 2),
        author: stroke.author || name,
        createdAt: Date.now()
      };
      board.strokes.push(normalized);
      broadcast(board, { type: "stroke:add", stroke: normalized }, clientId);
      return;
    }

    if (payload.type === "cursor:update") {
      const cursor = payload.cursor || {};
      if (typeof cursor.x !== "number" || typeof cursor.y !== "number") return;
      broadcast(
        board,
        { type: "cursor:update", clientId, cursor: { x: cursor.x, y: cursor.y, color, name } },
        clientId
      );
      return;
    }

    if (payload.type === "board:clear") {
      board.strokes = [];
      broadcast(board, { type: "board:clear" });
      return;
    }
  });

  socket.on("close", () => {
    board.users.delete(clientId);
    broadcast(board, { type: "presence:update", users: getUserList(board) });
  });
});

server.listen(PORT, () => {
  console.log(`Collaborative Whiteboard backend running on http://localhost:${PORT}`);
});
