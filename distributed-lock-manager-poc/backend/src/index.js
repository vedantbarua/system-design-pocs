import express from "express";
import { createClient } from "redis";
import { randomUUID } from "crypto";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 8081);
const INSTANCE_ID = process.env.DLM_INSTANCE_ID || process.env.HOSTNAME || "local";
const REDIS_HOST = process.env.DLM_REDIS_HOST || "localhost";
const REDIS_PORT = Number(process.env.DLM_REDIS_PORT || 6379);
const LOCK_TTL_MS = Number(process.env.DLM_LOCK_TTL_MS || 1500);

const redis = createClient({
  url: `redis://${REDIS_HOST}:${REDIS_PORT}`
});

const ACQUIRE_SCRIPT = `
local ok = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[2])
if ok then
  local token = redis.call('INCR', KEYS[2])
  return token
else
  return nil
end
`;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

const WRITE_SCRIPT = `
local current = redis.call('HGET', KEYS[1], 'token')
if (not current) or (tonumber(ARGV[1]) > tonumber(current)) then
  redis.call('HSET', KEYS[1], 'token', ARGV[1], 'payload', ARGV[2], 'writer', ARGV[3], 'updatedAt', ARGV[4])
  return 1
else
  return 0
end
`;

function lockKey(resource) {
  return `dlm:lock:${resource}`;
}

function fenceKey(resource) {
  return `dlm:fence:${resource}`;
}

function resourceKey(resource) {
  return `dlm:resource:${resource}`;
}

async function tryAcquire(resource) {
  const ownerId = randomUUID();
  const token = await redis.eval(ACQUIRE_SCRIPT, {
    keys: [lockKey(resource), fenceKey(resource)],
    arguments: [ownerId, String(LOCK_TTL_MS)]
  });
  if (token === null || token === undefined) {
    return null;
  }
  return {
    resource,
    ownerId,
    fencingToken: Number(token),
    acquiredAt: Date.now(),
    ttlMs: LOCK_TTL_MS
  };
}

async function releaseLock(resource, ownerId) {
  const result = await redis.eval(RELEASE_SCRIPT, {
    keys: [lockKey(resource)],
    arguments: [ownerId]
  });
  return Number(result) > 0;
}

async function writeIfTokenNewer(resource, token, payload, writer) {
  const result = await redis.eval(WRITE_SCRIPT, {
    keys: [resourceKey(resource)],
    arguments: [String(token), payload, writer, String(Date.now())]
  });
  const accepted = Number(result) === 1;
  const state = await redis.hGetAll(resourceKey(resource));
  return { accepted, state };
}

app.post("/dlm/demo", async (req, res) => {
  const { resource, payload = "", workMs = 0 } = req.body || {};
  if (!resource || typeof resource !== "string" || !resource.trim()) {
    return res.status(400).json({ error: "resource is required" });
  }
  const handle = await tryAcquire(resource.trim());
  if (!handle) {
    return res.json({
      instanceId: INSTANCE_ID,
      acquired: false,
      message: `Lock not acquired for resource=${resource}`
    });
  }

  const startedAt = new Date();
  let writeAccepted = false;
  let resourceState = null;
  try {
    if (workMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, workMs));
    }
    const result = await writeIfTokenNewer(resource.trim(), handle.fencingToken, payload, INSTANCE_ID);
    writeAccepted = result.accepted;
    resourceState = result.state;
  } finally {
    const released = await releaseLock(resource.trim(), handle.ownerId);
    return res.json({
      instanceId: INSTANCE_ID,
      acquired: true,
      ownerId: handle.ownerId,
      fencingToken: handle.fencingToken,
      writeAccepted,
      releaseSucceeded: released,
      startedAt,
      finishedAt: new Date(),
      resourceState,
      message: writeAccepted ? "Write accepted with fencing token" : "Write rejected due to stale token"
    });
  }
});

app.get("/dlm/state", async (req, res) => {
  const resource = req.query.resource;
  if (!resource || typeof resource !== "string" || !resource.trim()) {
    return res.status(400).json({ error: "resource is required" });
  }
  const state = await redis.hGetAll(resourceKey(resource.trim()));
  return res.json({
    resource: resource.trim(),
    fencingToken: state.token || null,
    payload: state.payload || null,
    writer: state.writer || null,
    updatedAtEpochMs: state.updatedAt || null
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", instanceId: INSTANCE_ID });
});

async function start() {
  redis.on("error", (err) => {
    console.error("Redis error", err);
  });
  await redis.connect();
  app.listen(PORT, () => {
    console.log(`DLM backend listening on ${PORT} (instance=${INSTANCE_ID})`);
  });
}

start().catch((err) => {
  console.error("Failed to start server", err);
  process.exit(1);
});
