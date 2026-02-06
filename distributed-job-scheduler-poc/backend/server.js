import crypto from "node:crypto";
import express from "express";
import cors from "cors";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8130;

const TICK_MS = 200;
const WHEEL_SIZE = 60;
const SLOT_MS = 1000;
const LEASE_MS = 3500;
const EVENT_LIMIT = 220;

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const nodes = new Map();
const shards = [
  { id: 0, name: "Shard-A" },
  { id: 1, name: "Shard-B" },
  { id: 2, name: "Shard-C" }
];

const jobStore = new Map();
const shardIndex = new Map();
const wheel = Array.from({ length: WHEEL_SIZE }, () => []);
let wheelPointer = 0;
const events = [];
const executions = [];
let leaderId = null;
let paused = false;
const MAX_DISPATCH_PER_TICK = 6;

function logEvent(type, payload) {
  events.unshift({ id: crypto.randomUUID(), type, payload, at: Date.now() });
  if (events.length > EVENT_LIMIT) events.pop();
}

function shardForTenant(tenantId) {
  const hash = Array.from(tenantId || "").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return shards[hash % shards.length];
}

function scheduleJob(job) {
  const delayMs = Math.max(0, job.runAt - Date.now());
  const slot = Math.floor(delayMs / SLOT_MS) % WHEEL_SIZE;
  const entry = {
    jobId: job.id,
    runAt: job.runAt,
    attempts: job.attempts
  };
  wheel[(wheelPointer + slot) % WHEEL_SIZE].push(entry);
}

function promoteDeferredJobs() {
  const slot = wheel[wheelPointer];
  wheel[wheelPointer] = [];
  const now = Date.now();

  slot.forEach((entry) => {
    const job = jobStore.get(entry.jobId);
    if (!job || job.status !== "scheduled") return;
    if (job.runAt > now) {
      scheduleJob(job);
      return;
    }
    job.status = "queued";
    job.updatedAt = now;
    logEvent("job.queued", { jobId: job.id, shard: job.shardId });
  });
}

function electLeader() {
  const now = Date.now();
  const activeNodes = Array.from(nodes.values()).filter((node) => node.expiresAt > now);
  activeNodes.sort((a, b) => a.id.localeCompare(b.id));
  leaderId = activeNodes.length > 0 ? activeNodes[0].id : null;
}

function heartbeatNode(nodeId) {
  const now = Date.now();
  const existing = nodes.get(nodeId);
  if (existing) {
    existing.expiresAt = now + LEASE_MS;
  } else {
    nodes.set(nodeId, { id: nodeId, startedAt: now, expiresAt: now + LEASE_MS });
  }
  electLeader();
}

function assignWorker(job) {
  const active = Array.from(nodes.values()).filter((node) => node.expiresAt > Date.now());
  if (active.length === 0) return null;
  const index = job.shardId % active.length;
  return active.sort((a, b) => a.id.localeCompare(b.id))[index];
}

function executeJob(job, workerId) {
  const execution = {
    id: crypto.randomUUID(),
    jobId: job.id,
    workerId,
    status: "running",
    startedAt: Date.now()
  };
  executions.unshift(execution);
  if (executions.length > EVENT_LIMIT) executions.pop();

  job.status = "running";
  job.workerId = workerId;
  job.startedAt = Date.now();
  job.updatedAt = job.startedAt;
  job.leaseExpiresAt = job.startedAt + LEASE_MS;
  job.executionId = execution.id;

  logEvent("job.running", { jobId: job.id, workerId, shard: job.shardId });

  const runtime = 400 + Math.floor(Math.random() * 800);
  setTimeout(() => {
    const fail = Math.random() < job.failureRate;
    if (fail) {
      job.status = "failed";
      job.updatedAt = Date.now();
      execution.status = "failed";
      execution.endedAt = Date.now();
      logEvent("job.failed", { jobId: job.id, workerId });

      if (job.attempts < job.maxAttempts) {
        job.attempts += 1;
        job.runAt = Date.now() + 2000;
        job.status = "scheduled";
        scheduleJob(job);
        logEvent("job.retry.scheduled", { jobId: job.id, attempt: job.attempts });
      }
      return;
    }

    job.status = "completed";
    job.completedAt = Date.now();
    job.updatedAt = job.completedAt;
    execution.status = "completed";
    execution.endedAt = Date.now();
    logEvent("job.completed", { jobId: job.id, workerId });
  }, runtime);
}

function checkLeases() {
  const now = Date.now();
  for (const job of jobStore.values()) {
    if (job.status === "running" && job.leaseExpiresAt && job.leaseExpiresAt < now) {
      logEvent("job.lease.expired", { jobId: job.id, workerId: job.workerId });
      job.status = "scheduled";
      job.workerId = null;
      job.runAt = Date.now() + 1000;
      job.attempts += 1;
      scheduleJob(job);
    }
  }
}

function drainQueue() {
  if (paused) return;
  if (!leaderId) return;

  let dispatched = 0;
  for (const job of jobStore.values()) {
    if (job.status !== "queued") continue;
    const worker = assignWorker(job);
    if (!worker) continue;
    executeJob(job, worker.id);
    dispatched += 1;
    if (dispatched >= MAX_DISPATCH_PER_TICK) break;
  }
}

setInterval(() => {
  wheelPointer = (wheelPointer + 1) % WHEEL_SIZE;
  promoteDeferredJobs();
  drainQueue();
  checkLeases();
}, TICK_MS);

app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), now: Date.now() });
});

app.get("/api/nodes", (req, res) => {
  res.json({ leaderId, nodes: Array.from(nodes.values()) });
});

app.post("/api/nodes/heartbeat", (req, res) => {
  const nodeId = req.body?.nodeId || `node-${crypto.randomUUID().slice(0, 6)}`;
  heartbeatNode(nodeId);
  logEvent("node.heartbeat", { nodeId });
  res.json({ ok: true, nodeId, leaderId });
});

app.get("/api/shards", (req, res) => {
  const counts = shards.map((shard) => ({
    ...shard,
    jobs: shardIndex.get(shard.id)?.length || 0
  }));
  res.json({ shards: counts });
});

app.post("/api/jobs", (req, res) => {
  const { tenantId, name, runAt, payload = {}, maxAttempts = 3 } = req.body || {};
  if (!tenantId || !name || !runAt) {
    return res.status(400).json({ error: "tenantId, name, runAt are required" });
  }

  const shard = shardForTenant(tenantId);
  const job = {
    id: crypto.randomUUID(),
    tenantId,
    name,
    payload,
    runAt: Number(runAt),
    shardId: shard.id,
    status: "scheduled",
    attempts: 1,
    maxAttempts,
    failureRate: 0.12,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  jobStore.set(job.id, job);
  if (!shardIndex.has(shard.id)) shardIndex.set(shard.id, []);
  shardIndex.get(shard.id).push(job.id);

  scheduleJob(job);
  logEvent("job.created", { jobId: job.id, shard: shard.id, runAt: job.runAt });

  res.status(201).json(job);
});

app.get("/api/jobs", (req, res) => {
  const limit = Number(req.query.limit || 50);
  const items = Array.from(jobStore.values())
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  res.json(items);
});

app.get("/api/executions", (req, res) => {
  const limit = Number(req.query.limit || 40);
  res.json(executions.slice(-limit).reverse());
});

app.get("/api/queues", (req, res) => {
  const byStatus = Array.from(jobStore.values()).reduce((acc, job) => {
    acc[job.status] = (acc[job.status] || 0) + 1;
    return acc;
  }, {});

  const wheelDepth = wheel.reduce((acc, slot) => acc + slot.length, 0);

  res.json({
    leaderId,
    paused,
    wheelPointer,
    wheelDepth,
    statusCounts: byStatus
  });
});

app.get("/api/events", (req, res) => {
  res.json(events);
});

app.post("/api/controls/pause", (req, res) => {
  paused = true;
  logEvent("controls.paused", {});
  res.json({ ok: true, paused });
});

app.post("/api/controls/resume", (req, res) => {
  paused = false;
  logEvent("controls.resumed", {});
  res.json({ ok: true, paused });
});

app.post("/api/seed", (req, res) => {
  const now = Date.now();
  const jobs = [];
  for (let i = 0; i < 12; i += 1) {
    const runAt = now + 2000 + Math.floor(Math.random() * 12000);
    jobs.push({
      tenantId: `tenant-${(i % 3) + 1}`,
      name: "thundering-herd",
      runAt,
      payload: { index: i },
      maxAttempts: 3
    });
  }
  for (const job of jobs) {
    const shard = shardForTenant(job.tenantId);
    const item = {
      id: crypto.randomUUID(),
      tenantId: job.tenantId,
      name: job.name,
      payload: job.payload,
      runAt: job.runAt,
      shardId: shard.id,
      status: "scheduled",
      attempts: 1,
      maxAttempts: job.maxAttempts,
      failureRate: 0.1,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    jobStore.set(item.id, item);
    if (!shardIndex.has(shard.id)) shardIndex.set(shard.id, []);
    shardIndex.get(shard.id).push(item.id);
    scheduleJob(item);
  }

  logEvent("seed.completed", { jobs: jobs.length });
  res.json({ ok: true, jobs: jobs.length });
});

app.listen(PORT, () => {
  console.log(`Distributed job scheduler backend running on http://localhost:${PORT}`);
});
