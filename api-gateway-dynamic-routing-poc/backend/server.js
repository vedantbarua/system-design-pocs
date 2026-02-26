import express from "express";
import cors from "cors";
import { createProxyMiddleware } from "http-proxy-middleware";

const GATEWAY_PORT = process.env.GATEWAY_PORT
  ? Number(process.env.GATEWAY_PORT)
  : 9100;

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:9101";
const ORDER_SERVICE_URL = process.env.ORDER_SERVICE_URL || "http://localhost:9102";

const DEFAULT_TIMEOUT_MS = 1800;

class CircuitBreaker {
  constructor({ failureThreshold, successThreshold, openDurationMs }) {
    this.failureThreshold = failureThreshold;
    this.successThreshold = successThreshold;
    this.openDurationMs = openDurationMs;
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureAt = null;
    this.lastSuccessAt = null;
    this.openUntil = null;
  }

  canRequest() {
    if (this.state === "OPEN") {
      if (this.openUntil && Date.now() >= this.openUntil) {
        this.state = "HALF_OPEN";
        this.successCount = 0;
        return true;
      }
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.lastSuccessAt = Date.now();
    if (this.state === "HALF_OPEN") {
      this.successCount += 1;
      if (this.successCount >= this.successThreshold) {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.successCount = 0;
        this.openUntil = null;
      }
    } else {
      this.failureCount = 0;
    }
  }

  recordFailure() {
    this.lastFailureAt = Date.now();
    if (this.state === "HALF_OPEN") {
      this.trip();
      return;
    }

    this.failureCount += 1;
    if (this.failureCount >= this.failureThreshold) {
      this.trip();
    }
  }

  trip() {
    this.state = "OPEN";
    this.openUntil = Date.now() + this.openDurationMs;
    this.successCount = 0;
  }

  reset() {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.successCount = 0;
    this.openUntil = null;
  }
}

const breakerConfig = {
  failureThreshold: 3,
  successThreshold: 2,
  openDurationMs: 10_000
};

const breakers = new Map();

function getBreaker(serviceId) {
  if (!breakers.has(serviceId)) {
    breakers.set(serviceId, new CircuitBreaker(breakerConfig));
  }
  return breakers.get(serviceId);
}

function breakerSnapshot(serviceId) {
  const breaker = getBreaker(serviceId);
  return {
    id: serviceId,
    state: breaker.state,
    failureCount: breaker.failureCount,
    lastFailureAt: breaker.lastFailureAt,
    lastSuccessAt: breaker.lastSuccessAt,
    openUntil: breaker.openUntil
  };
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

let routeRegistry = [
  {
    id: "users",
    name: "User Service",
    prefix: "/api/users",
    target: USER_SERVICE_URL
  },
  {
    id: "orders",
    name: "Order Service",
    prefix: "/api/orders",
    target: ORDER_SERVICE_URL
  }
];

const refreshRoutes = () => {
  routeRegistry = routeRegistry
    .map((route) => ({ ...route }))
    .sort((a, b) => b.prefix.length - a.prefix.length);
};

refreshRoutes();

const resolveRoute = (path) =>
  routeRegistry.find((route) => path.startsWith(route.prefix));

async function fetchWithBreaker(serviceId, url, options = {}) {
  const breaker = getBreaker(serviceId);
  if (!breaker.canRequest()) {
    const error = new Error("Circuit open");
    error.code = "CIRCUIT_OPEN";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    if (!response.ok) {
      const error = new Error(`Upstream ${serviceId} responded ${response.status}`);
      error.code = "UPSTREAM_ERROR";
      error.status = response.status;
      throw error;
    }
    breaker.recordSuccess();
    return response;
  } catch (error) {
    if (error.name === "AbortError") {
      const timeoutError = new Error("Upstream timeout");
      timeoutError.code = "UPSTREAM_TIMEOUT";
      breaker.recordFailure();
      throw timeoutError;
    }
    breaker.recordFailure();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "gateway", uptime: process.uptime(), now: Date.now() });
});

app.get("/api/routes", (req, res) => {
  res.json(routeRegistry);
});

app.post("/api/routes", (req, res) => {
  const { id, name, prefix, target } = req.body || {};
  if (!id || !prefix || !target) {
    return res.status(400).json({ error: "id, prefix, and target are required" });
  }
  const normalizedPrefix = prefix.startsWith("/") ? prefix : `/${prefix}`;
  const existingIndex = routeRegistry.findIndex((route) => route.id === id);
  const nextRoute = {
    id,
    name: name || id,
    prefix: normalizedPrefix,
    target
  };

  if (existingIndex >= 0) {
    routeRegistry[existingIndex] = nextRoute;
  } else {
    routeRegistry.push(nextRoute);
  }
  refreshRoutes();
  res.json({ ok: true, routes: routeRegistry });
});

app.get("/api/circuit", (req, res) => {
  res.json({
    updatedAt: Date.now(),
    services: routeRegistry.map((route) => breakerSnapshot(route.id))
  });
});

app.post("/api/circuit/:id/reset", (req, res) => {
  const id = req.params.id;
  const breaker = getBreaker(id);
  breaker.reset();
  res.json({ ok: true, service: breakerSnapshot(id) });
});

app.get("/api/health/services", async (req, res) => {
  const checks = await Promise.all(
    routeRegistry.map(async (route) => {
      try {
        const response = await fetchWithBreaker(
          route.id,
          `${route.target}/health`
        );
        const data = await response.json();
        return {
          id: route.id,
          name: route.name,
          target: route.target,
          status: "ok",
          details: data,
          breaker: breakerSnapshot(route.id)
        };
      } catch (error) {
        return {
          id: route.id,
          name: route.name,
          target: route.target,
          status: "degraded",
          error: error.code || error.message,
          breaker: breakerSnapshot(route.id)
        };
      }
    })
  );

  res.json({ updatedAt: Date.now(), services: checks });
});

app.get("/api/aggregate/:userId", async (req, res) => {
  const userId = req.params.userId;
  const warnings = [];
  const response = { userId, user: null, orders: null, warnings };

  const tasks = [
    fetchWithBreaker("users", `${USER_SERVICE_URL}/users/${userId}`)
      .then((r) => r.json())
      .then((data) => {
        response.user = data;
      })
      .catch((error) => {
        warnings.push({ service: "users", error: error.code || error.message });
      }),
    fetchWithBreaker("orders", `${ORDER_SERVICE_URL}/orders?userId=${userId}`)
      .then((r) => r.json())
      .then((data) => {
        response.orders = data;
      })
      .catch((error) => {
        warnings.push({ service: "orders", error: error.code || error.message });
      })
  ];

  await Promise.all(tasks);

  res.json({
    ...response,
    aggregatedAt: Date.now(),
    breakers: {
      users: breakerSnapshot("users"),
      orders: breakerSnapshot("orders")
    }
  });
});

const proxy = createProxyMiddleware({
  changeOrigin: true,
  router: (req) => req.serviceRoute?.target,
  pathRewrite: (path, req) => {
    if (!req.serviceRoute) return path;
    return path.replace(req.serviceRoute.prefix, "");
  },
  onProxyRes: (proxyRes, req) => {
    if (!req.serviceRoute) return;
    if (proxyRes.statusCode >= 500) {
      getBreaker(req.serviceRoute.id).recordFailure();
    } else {
      getBreaker(req.serviceRoute.id).recordSuccess();
    }
  },
  onError: (err, req) => {
    if (!req.serviceRoute) return;
    getBreaker(req.serviceRoute.id).recordFailure();
  }
});

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) return next();
  const route = resolveRoute(req.path);
  if (!route) return next();
  req.serviceRoute = route;
  const breaker = getBreaker(route.id);
  if (!breaker.canRequest()) {
    return res.status(503).json({
      error: "circuit_open",
      service: route.id,
      openUntil: breaker.openUntil
    });
  }
  return proxy(req, res, next);
});

app.use((req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.listen(GATEWAY_PORT, () => {
  console.log(`API Gateway running on http://localhost:${GATEWAY_PORT}`);
});
