import http from "node:http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";
import * as Y from "yjs";

const app = express();
app.use(cors({ origin: "*" }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const doc = new Y.Doc();
const ytext = doc.getText("content");

function toUint8Array(payload) {
  if (payload instanceof Uint8Array) return payload;
  if (payload instanceof ArrayBuffer) return new Uint8Array(payload);
  if (Array.isArray(payload)) return new Uint8Array(payload);
  return new Uint8Array(payload?.data || []);
}

io.on("connection", (socket) => {
  console.log("client connected", socket.id);

  const fullUpdate = Y.encodeStateAsUpdate(doc);
  socket.emit("sync:init", fullUpdate);

  socket.on("doc:update", (payload) => {
    const update = toUint8Array(payload);
    Y.applyUpdate(doc, update);
    socket.broadcast.emit("doc:update", update);
  });

  socket.on("disconnect", () => {
    console.log("client disconnected", socket.id);
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/doc", (_req, res) => {
  res.json({ text: ytext.toString(), length: ytext.length });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`sync engine listening on http://localhost:${PORT}`);
});
