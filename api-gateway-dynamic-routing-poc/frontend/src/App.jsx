import { useEffect, useMemo, useState } from "react";

const SERVICE_PATHS = {
  users: "/api/users",
  orders: "/api/orders"
};

const DEFAULT_USER_ID = "u-1001";

const formatTime = (timestamp) => {
  if (!timestamp) return "-";
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
};

const stateTone = (state) => {
  if (state === "OPEN") return "status danger";
  if (state === "HALF_OPEN") return "status warn";
  return "status ok";
};

export default function App() {
  const [routes, setRoutes] = useState([]);
  const [health, setHealth] = useState([]);
  const [circuits, setCircuits] = useState([]);
  const [aggregate, setAggregate] = useState(null);
  const [userId, setUserId] = useState(DEFAULT_USER_ID);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chaosDraft, setChaosDraft] = useState({});

  const circuitMap = useMemo(() => {
    const map = {};
    circuits.forEach((item) => {
      map[item.id] = item;
    });
    return map;
  }, [circuits]);

  const loadRoutes = async () => {
    const res = await fetch("/api/routes");
    const data = await res.json();
    setRoutes(data);
  };

  const loadHealth = async () => {
    const res = await fetch("/api/health/services");
    const data = await res.json();
    setHealth(data.services || []);
  };

  const loadCircuits = async () => {
    const res = await fetch("/api/circuit");
    const data = await res.json();
    setCircuits(data.services || []);
  };

  const loadAll = async () => {
    try {
      setError(null);
      await Promise.all([loadRoutes(), loadHealth(), loadCircuits()]);
    } catch (err) {
      setError("Gateway is unreachable. Check the backend servers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 2000);
    return () => clearInterval(interval);
  }, []);

  const onAggregate = async () => {
    setError(null);
    const res = await fetch(`/api/aggregate/${userId}`);
    const data = await res.json();
    setAggregate(data);
  };

  const updateChaosDraft = (serviceId, patch) => {
    setChaosDraft((prev) => ({
      ...prev,
      [serviceId]: {
        ...prev[serviceId],
        ...patch
      }
    }));
  };

  const applyChaos = async (serviceId) => {
    const payload = chaosDraft[serviceId] || {};
    await fetch(`${SERVICE_PATHS[serviceId]}/admin/chaos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    loadAll();
  };

  const resetCircuit = async (serviceId) => {
    await fetch(`/api/circuit/${serviceId}/reset`, { method: "POST" });
    loadCircuits();
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">API Gateway POC</p>
          <h1>Dynamic Routing Control Room</h1>
          <p className="subtitle">
            Aggregate user + order data, route traffic to microservices, and trip circuit
            breakers before cascading failures spread.
          </p>
        </div>
        <div className="hero-card">
          <p className="label">Gateway Pulse</p>
          <p className="value">{loading ? "booting" : "live"}</p>
          <p className="meta">Refreshes every 2s</p>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="grid two">
        <div className="card">
          <h2>Route Registry</h2>
          <div className="route-list">
            {routes.map((route) => (
              <div key={route.id} className="route">
                <div>
                  <p className="label">{route.name}</p>
                  <p className="meta">{route.prefix}</p>
                </div>
                <div className="pill">{route.target}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Request Aggregation</h2>
          <p className="meta">
            Pulls user + orders concurrently and annotates any degraded services.
          </p>
          <div className="row">
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="u-1001"
            />
            <button className="primary" onClick={onAggregate}>
              Aggregate
            </button>
          </div>
          <pre className="code">
            {aggregate ? JSON.stringify(aggregate, null, 2) : "Run aggregation"}
          </pre>
        </div>
      </section>

      <section className="grid three">
        {health.map((service) => (
          <div key={service.id} className="card">
            <div className="card-head">
              <div>
                <p className="label">{service.name}</p>
                <p className="meta">{service.target}</p>
              </div>
              <span className={`status ${service.status === "ok" ? "ok" : "warn"}`}>
                {service.status}
              </span>
            </div>
            <div className="stack">
              <p className="meta">Breaker</p>
              <div className="breaker">
                <span className={stateTone(service.breaker?.state)}>
                  {service.breaker?.state || "unknown"}
                </span>
                <button className="ghost" onClick={() => resetCircuit(service.id)}>
                  Reset
                </button>
              </div>
              <p className="meta">
                Last success {formatTime(service.breaker?.lastSuccessAt)}
              </p>
              <p className="meta">
                Last failure {formatTime(service.breaker?.lastFailureAt)}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid two">
        <div className="card">
          <h2>Circuit Breakers</h2>
          <div className="stack">
            {circuits.map((service) => (
              <div key={service.id} className="route">
                <div>
                  <p className="label">{service.id}</p>
                  <p className="meta">
                    failures {service.failureCount} · open until{" "}
                    {service.openUntil ? formatTime(service.openUntil) : "-"}
                  </p>
                </div>
                <span className={stateTone(service.state)}>{service.state}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Chaos Controls</h2>
          <p className="meta">Inject latency or failures to see the breaker trip.</p>
          {health.map((service) => {
            const draft = chaosDraft[service.id] || {};
            return (
              <div key={service.id} className="chaos">
                <div className="row between">
                  <div>
                    <p className="label">{service.name}</p>
                    <p className="meta">Failure rate {draft.failureRate ?? 0}</p>
                  </div>
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={Boolean(draft.down)}
                      onChange={(event) =>
                        updateChaosDraft(service.id, { down: event.target.checked })
                      }
                    />
                    <span>Hard down</span>
                  </label>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={draft.failureRate ?? 0}
                  onChange={(event) =>
                    updateChaosDraft(service.id, { failureRate: Number(event.target.value) })
                  }
                />
                <div className="row">
                  <input
                    type="number"
                    value={draft.delayMs ?? 150}
                    onChange={(event) =>
                      updateChaosDraft(service.id, { delayMs: Number(event.target.value) })
                    }
                    placeholder="delay ms"
                  />
                  <input
                    type="number"
                    value={draft.jitterMs ?? 150}
                    onChange={(event) =>
                      updateChaosDraft(service.id, { jitterMs: Number(event.target.value) })
                    }
                    placeholder="jitter ms"
                  />
                  <button className="ghost" onClick={() => applyChaos(service.id)}>
                    Apply
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
