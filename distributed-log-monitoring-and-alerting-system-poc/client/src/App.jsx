import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8080/api";

const levelOptions = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR", "FATAL"];

const sampleMessages = [
  "Order routed to matching engine",
  "Trade rejected: insufficient margin",
  "Matching engine latency spike",
  "User email john.doe@example.com attempted login",
  "Payment failed with card 4111111111111111"
];

function usePolling(fetcher, intervalMs) {
  useEffect(() => {
    let active = true;
    const tick = async () => {
      try {
        await fetcher();
      } catch (err) {
        if (active) {
          console.warn("Polling failed", err);
        }
      }
    };
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [fetcher, intervalMs]);
}

export default function App() {
  const [source, setSource] = useState("client-ui");
  const [module, setModule] = useState("order-router");
  const [level, setLevel] = useState("INFO");
  const [message, setMessage] = useState(sampleMessages[0]);
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState("Idle");

  const fetchLogs = useMemo(
    () => async () => {
      const res = await fetch(`${API_BASE}/logs`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const data = await res.json();
      setLogs(data);
    },
    []
  );

  const fetchAlerts = useMemo(
    () => async () => {
      const res = await fetch(`${API_BASE}/alerts`);
      if (!res.ok) throw new Error("Failed to fetch alerts");
      const data = await res.json();
      setAlerts(data);
    },
    []
  );

  usePolling(fetchLogs, 3000);
  usePolling(fetchAlerts, 3000);

  const sendLog = async (payload) => {
    setStatus("Sending...");
    try {
      const res = await fetch(`${API_BASE}/logs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Failed to send log");
      setStatus("Log sent");
      await fetchLogs();
      await fetchAlerts();
    } catch (err) {
      console.error(err);
      setStatus("Error sending log");
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendLog({
      source,
      module,
      level,
      message,
      originalTimestamp: new Date().toISOString(),
      metadata: {
        traderId: "T-409",
        sessionId: "S-1049"
      }
    });
  };

  const sendSampleBurst = async () => {
    for (let i = 0; i < 3; i += 1) {
      const payload = {
        source,
        module,
        level: i === 2 ? "ERROR" : level,
        message: sampleMessages[i % sampleMessages.length],
        originalTimestamp: new Date().toISOString(),
        metadata: {
          burst: "true",
          index: String(i + 1)
        }
      };
      await sendLog(payload);
    }
  };

  const clearAlerts = async () => {
    await fetch(`${API_BASE}/alerts`, { method: "DELETE" });
    await fetchAlerts();
  };

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Distributed Log Monitoring</p>
          <h1>Trading Match Engine Log Flow</h1>
          <p className="subtitle">
            Capture logs, scrub PII, enrich metadata, apply filters, and trigger alerts.
          </p>
        </div>
        <div className="status">
          <span>Status</span>
          <strong>{status}</strong>
        </div>
      </header>

      <section className="grid">
        <form className="card" onSubmit={handleSubmit}>
          <h2>Send Log</h2>
          <label>
            Source
            <input value={source} onChange={(e) => setSource(e.target.value)} />
          </label>
          <label>
            Module
            <input value={module} onChange={(e) => setModule(e.target.value)} />
          </label>
          <label>
            Level
            <select value={level} onChange={(e) => setLevel(e.target.value)}>
              {levelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Message
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
          </label>
          <div className="actions">
            <button type="submit">Send log</button>
            <button type="button" className="ghost" onClick={sendSampleBurst}>
              Send sample burst
            </button>
          </div>
        </form>

        <div className="card">
          <h2>Active Alerts</h2>
          <button type="button" className="ghost" onClick={clearAlerts}>
            Clear alerts
          </button>
          <div className="list">
            {alerts.length === 0 ? (
              <p className="empty">No alerts yet.</p>
            ) : (
              alerts.map((alert, index) => (
                <div key={`${alert.ruleName}-${index}`} className="list-item">
                  <div>
                    <strong>{alert.ruleName}</strong>
                    <p>{alert.message}</p>
                  </div>
                  <span>{new Date(alert.triggeredAt).toLocaleTimeString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="card logs">
        <h2>Recent Logs</h2>
        <div className="list">
          {logs.length === 0 ? (
            <p className="empty">No logs yet.</p>
          ) : (
            logs
              .slice()
              .reverse()
              .map((log, index) => (
                <div key={`${log.timestamp}-${index}`} className="list-item">
                  <div>
                    <strong>{log.level}</strong>
                    <p>{log.message}</p>
                    <small>{log.module} · {log.source}</small>
                  </div>
                  <span>{log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : "-"}</span>
                </div>
              ))
          )}
        </div>
      </section>
    </div>
  );
}
