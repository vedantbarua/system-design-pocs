import crypto from "node:crypto";
import express from "express";
import cors from "cors";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8120;
const DEDUPE_WINDOW_MS = process.env.DEDUPE_WINDOW_MS
  ? Number(process.env.DEDUPE_WINDOW_MS)
  : 2 * 60 * 1000;
const EVENT_LIMIT = 200;

const CHANNELS = ["sms", "email", "push"];

class RateLimiter {
  constructor(ratePerSec, burst = ratePerSec) {
    this.ratePerSec = ratePerSec;
    this.burst = burst;
    this.tokens = burst;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefill) / 1000;
    if (elapsedSec <= 0) return;
    const refillAmount = elapsedSec * this.ratePerSec;
    this.tokens = Math.min(this.burst, this.tokens + refillAmount);
    this.lastRefill = now;
  }

  tryConsume() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}

class PriorityQueue {
  constructor() {
    this.items = [];
  }

  size() {
    return this.items.length;
  }

  push(item) {
    const index = this.items.findIndex((existing) => {
      if (existing.priority !== item.priority) {
        return existing.priority < item.priority;
      }
      return existing.createdAt > item.createdAt;
    });

    if (index === -1) {
      this.items.push(item);
    } else {
      this.items.splice(index, 0, item);
    }
  }

  pop() {
    return this.items.shift();
  }

  countsByPriority() {
    const counts = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
    for (const item of this.items) {
      const key = String(item.priority || 3);
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const templates = new Map();
const notifications = [];
const dedupeIndex = new Map();
const events = [];
let paused = false;

const topics = new Map(
  CHANNELS.map((channel) => [channel, { queue: new PriorityQueue() }])
);

const providers = [
  {
    id: "sms-twilio",
    name: "Twilio",
    channel: "sms",
    limiter: new RateLimiter(6, 12),
    failureRate: 0.08
  },
  {
    id: "sms-sns",
    name: "SNS",
    channel: "sms",
    limiter: new RateLimiter(4, 8),
    failureRate: 0.05
  },
  {
    id: "email-sendgrid",
    name: "SendGrid",
    channel: "email",
    limiter: new RateLimiter(10, 20),
    failureRate: 0.04
  },
  {
    id: "email-ses",
    name: "SES",
    channel: "email",
    limiter: new RateLimiter(12, 24),
    failureRate: 0.02
  },
  {
    id: "push-fcm",
    name: "FCM",
    channel: "push",
    limiter: new RateLimiter(16, 32),
    failureRate: 0.03
  },
  {
    id: "push-apns",
    name: "APNS",
    channel: "push",
    limiter: new RateLimiter(14, 28),
    failureRate: 0.03
  }
];

function logEvent(type, payload) {
  events.unshift({
    id: crypto.randomUUID(),
    type,
    payload,
    at: Date.now()
  });
  if (events.length > EVENT_LIMIT) events.pop();
}

function renderTemplate(template, params) {
  const apply = (text) =>
    text.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key) => {
      const value = params?.[key];
      return value === undefined || value === null ? "" : String(value);
    });

  return {
    subject: template.subject ? apply(template.subject) : "",
    body: apply(template.body || "")
  };
}

function isDuplicate(channel, dedupeKey) {
  if (!dedupeKey) return false;
  const scopedKey = `${channel}:${dedupeKey}`;
  const now = Date.now();
  const entry = dedupeIndex.get(scopedKey);
  if (entry && now - entry.timestamp < DEDUPE_WINDOW_MS) {
    return true;
  }
  dedupeIndex.set(scopedKey, { timestamp: now });
  return false;
}

function enqueueNotification(notification) {
  const topic = topics.get(notification.channel);
  if (!topic) return;
  topic.queue.push(notification);
  logEvent("queue.enqueued", {
    notificationId: notification.id,
    channel: notification.channel,
    priority: notification.priority
  });
}

function scheduleRetry(notification) {
  notification.status = "retrying";
  notification.updatedAt = Date.now();
  const delayMs = 1000 + Math.floor(Math.random() * 1500);
  setTimeout(() => {
    notification.status = "queued";
    notification.updatedAt = Date.now();
    enqueueNotification(notification);
    logEvent("queue.retry", {
      notificationId: notification.id,
      attempt: notification.attempts,
      channel: notification.channel
    });
  }, delayMs);
}

function processProvider(provider) {
  if (paused) return;
  const topic = topics.get(provider.channel);
  if (!topic || topic.queue.size() === 0) return;
  if (!provider.limiter.tryConsume()) return;

  const notification = topic.queue.pop();
  if (!notification) return;

  notification.status = "sending";
  notification.providerId = provider.id;
  notification.updatedAt = Date.now();
  logEvent("dispatch.started", {
    notificationId: notification.id,
    providerId: provider.id,
    channel: notification.channel,
    priority: notification.priority
  });

  const latency = 250 + Math.floor(Math.random() * 700);
  setTimeout(() => {
    const failed = Math.random() < provider.failureRate;
    if (failed) {
      notification.status = "failed";
      notification.updatedAt = Date.now();
      logEvent("dispatch.failed", {
        notificationId: notification.id,
        providerId: provider.id,
        channel: notification.channel
      });

      if (notification.attempts < notification.maxAttempts) {
        notification.attempts += 1;
        scheduleRetry(notification);
      }
      return;
    }

    notification.status = "delivered";
    notification.updatedAt = Date.now();
    logEvent("dispatch.delivered", {
      notificationId: notification.id,
      providerId: provider.id,
      channel: notification.channel
    });
  }, latency);
}

providers.forEach((provider) => {
  setInterval(() => processProvider(provider), 200);
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), now: Date.now() });
});

app.get("/api/templates", (req, res) => {
  res.json(Array.from(templates.values()));
});

app.post("/api/templates", (req, res) => {
  const { name, channel, subject = "", body = "", variables = [] } = req.body || {};
  if (!name || !CHANNELS.includes(channel) || !body) {
    return res.status(400).json({ error: "name, channel, and body are required" });
  }

  const template = {
    id: crypto.randomUUID(),
    name,
    channel,
    subject,
    body,
    variables,
    createdAt: Date.now()
  };
  templates.set(template.id, template);
  logEvent("template.created", { templateId: template.id, channel });
  res.status(201).json(template);
});

app.get("/api/templates/:id", (req, res) => {
  const template = templates.get(req.params.id);
  if (!template) return res.status(404).json({ error: "template not found" });
  res.json(template);
});

app.post("/api/templates/:id/render", (req, res) => {
  const template = templates.get(req.params.id);
  if (!template) return res.status(404).json({ error: "template not found" });
  const params = req.body?.params || {};
  res.json(renderTemplate(template, params));
});

app.get("/api/providers", (req, res) => {
  res.json(
    providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      channel: provider.channel,
      ratePerSec: provider.limiter.ratePerSec,
      burst: provider.limiter.burst,
      tokens: Number(provider.limiter.tokens.toFixed(2))
    }))
  );
});

app.post("/api/providers/:id/rate", (req, res) => {
  const provider = providers.find((item) => item.id === req.params.id);
  if (!provider) return res.status(404).json({ error: "provider not found" });
  const ratePerSec = Number(req.body?.ratePerSec);
  const burst = Number(req.body?.burst || ratePerSec);
  if (!Number.isFinite(ratePerSec) || ratePerSec <= 0) {
    return res.status(400).json({ error: "ratePerSec must be positive" });
  }
  provider.limiter.ratePerSec = ratePerSec;
  provider.limiter.burst = Number.isFinite(burst) && burst > 0 ? burst : ratePerSec;
  provider.limiter.tokens = provider.limiter.burst;
  logEvent("provider.rate.updated", { providerId: provider.id, ratePerSec });
  res.json({ ok: true });
});

app.get("/api/notifications", (req, res) => {
  const limit = Number(req.query.limit || 50);
  res.json(notifications.slice(-limit).reverse());
});

app.post("/api/notifications", (req, res) => {
  const {
    userId,
    channel,
    templateId,
    params = {},
    priority = 3,
    dedupeKey
  } = req.body || {};

  if (!userId || !CHANNELS.includes(channel) || !templateId) {
    return res.status(400).json({ error: "userId, channel, and templateId are required" });
  }

  const template = templates.get(templateId);
  if (!template) return res.status(404).json({ error: "template not found" });
  if (template.channel !== channel) {
    return res.status(400).json({ error: "channel must match template channel" });
  }

  const notification = {
    id: crypto.randomUUID(),
    userId,
    channel,
    templateId,
    params,
    priority: Math.max(1, Math.min(5, Number(priority) || 3)),
    dedupeKey: dedupeKey || null,
    status: "queued",
    attempts: 1,
    maxAttempts: 3,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  notifications.push(notification);

  if (isDuplicate(notification.channel, notification.dedupeKey)) {
    notification.status = "deduped";
    notification.updatedAt = Date.now();
    logEvent("notification.deduped", {
      notificationId: notification.id,
      dedupeKey: notification.dedupeKey
    });
    return res.status(201).json({ ...notification, deduped: true });
  }

  const rendered = renderTemplate(template, params);
  notification.rendered = rendered;
  enqueueNotification(notification);

  res.status(201).json(notification);
});

app.get("/api/queues", (req, res) => {
  const byChannel = {};
  for (const [channel, topic] of topics.entries()) {
    byChannel[channel] = {
      depth: topic.queue.size(),
      byPriority: topic.queue.countsByPriority()
    };
  }

  const byStatus = notifications.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  res.json({
    paused,
    dedupeWindowMs: DEDUPE_WINDOW_MS,
    queues: byChannel,
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
  const templatesToAdd = [
    {
      name: "Order Confirmation",
      channel: "email",
      subject: "Your order {{orderId}} is confirmed",
      body: "Hi {{name}}, your order {{orderId}} has been confirmed. ETA {{eta}}.",
      variables: ["name", "orderId", "eta"]
    },
    {
      name: "OTP Code",
      channel: "sms",
      subject: "",
      body: "Your login code is {{code}}",
      variables: ["code"]
    },
    {
      name: "Price Drop",
      channel: "push",
      subject: "",
      body: "{{item}} dropped to {{price}}. Tap to view.",
      variables: ["item", "price"]
    }
  ];

  templatesToAdd.forEach((seed) => {
    const template = {
      id: crypto.randomUUID(),
      ...seed,
      createdAt: Date.now()
    };
    templates.set(template.id, template);
  });

  logEvent("seed.completed", { templates: templatesToAdd.length });
  res.json({ ok: true, templates: Array.from(templates.values()) });
});

app.listen(PORT, () => {
  console.log(`Notification system backend running on http://localhost:${PORT}`);
});
