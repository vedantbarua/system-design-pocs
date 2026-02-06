import { useEffect, useMemo, useState } from "react";

const DEFAULT_JOB = {
  tenantId: "tenant-1",
  name: "daily-summary",
  runAt: "",
  payload: "{\n  \"type\": \"digest\",\n  \"region\": \"us-east\"\n}",
  maxAttempts: 3
};

function formatTime(epochMs) {
  if (!epochMs) return "-";
  return new Date(epochMs).toLocaleTimeString();
}

function formatDate(epochMs) {
  if (!epochMs) return "-";
  return new Date(epochMs).toLocaleString();
}

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [leaderId, setLeaderId] = useState(null);
  const [shards, setShards] = useState([]);
  const [queues, setQueues] = useState(null);
  const [events, setEvents] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [jobForm, setJobForm] = useState(DEFAULT_JOB);
  const [error, setError] = useState(null);
  const [paused, setPaused] = useState(false);
  const [nodeId, setNodeId] = useState(null);

  const nextRunAt = useMemo(() => {
    const now = Date.now() + 5000;
    return new Date(now).toISOString();
  }, []);

  const loadNodes = async () => {
    const res = await fetch("/api/nodes");
    const data = await res.json();
    setNodes(data.nodes || []);
    setLeaderId(data.leaderId || null);
  };

  const loadShards = async () => {
    const res = await fetch("/api/shards");
    const data = await res.json();
    setShards(data.shards || []);
  };

  const loadQueues = async () => {
    const res = await fetch("/api/queues");
    const data = await res.json();
    setQueues(data);
    setPaused(Boolean(data.paused));
  };

  const loadEvents = async () => {
    const res = await fetch("/api/events");
    const data = await res.json();
    setEvents(data);
  };

  const loadJobs = async () => {
    const res = await fetch("/api/jobs?limit=30");
    const data = await res.json();
    setJobs(data);
  };

  const loadExecutions = async () => {
    const res = await fetch("/api/executions?limit=20");
    const data = await res.json();
    setExecutions(data);
  };

  const sendHeartbeat = async () => {
    const res = await fetch("/api/nodes/heartbeat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodeId })
    });
    const data = await res.json();
    if (!nodeId) setNodeId(data.nodeId);
    setLeaderId(data.leaderId || null);
  };

  useEffect(() => {
    setJobForm((prev) => ({
      ...prev,
      runAt: prev.runAt || nextRunAt
    }));
  }, [nextRunAt]);

  useEffect(() => {
    loadNodes();
    loadShards();
    loadQueues();
    loadEvents();
    loadJobs();
    loadExecutions();
    sendHeartbeat();

    const fast = setInterval(() => {
      loadQueues();
      loadEvents();
      loadJobs();
      loadExecutions();
      loadNodes();
    }, 1200);

    const hb = setInterval(() => {
      sendHeartbeat();
    }, 1500);

    const slow = setInterval(() => {
      loadShards();
    }, 5000);

    return () => {
      clearInterval(fast);
      clearInterval(hb);
      clearInterval(slow);
    };
  }, []);

  const onCreateJob = async (event) => {
    event.preventDefault();
    setError(null);

    let payloadObj = {};
    try {
      payloadObj = jobForm.payload ? JSON.parse(jobForm.payload) : {};
    } catch (err) {
      setError("Payload must be valid JSON");
      return;
    }

    const runAt = jobForm.runAt ? new Date(jobForm.runAt).getTime() : Date.now() + 5000;

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId: jobForm.tenantId,
        name: jobForm.name,
        runAt,
        payload: payloadObj,
        maxAttempts: Number(jobForm.maxAttempts || 3)
      })
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create job");
      return;
    }

    loadJobs();
    loadQueues();
  };

  const onSeed = async () => {
    await fetch("/api/seed", { method: "POST" });
    loadJobs();
  };

  const onPauseToggle = async () => {
    if (paused) {
      await fetch("/api/controls/resume", { method: "POST" });
    } else {
      await fetch("/api/controls/pause", { method: "POST" });
    }
    loadQueues();
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Distributed Job Scheduler</p>
          <h1>Cron-as-a-Service with Leader Election</h1>
          <p className="subtitle">
            Timing wheel scheduler with sharded job store, worker leasing, and at-least-once
            delivery. Designed to survive thundering herds at the top of the hour.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={onSeed}>Seed Thundering Herd</button>
          <button className={paused ? "primary" : "danger"} onClick={onPauseToggle}>
            {paused ? "Resume Scheduler" : "Pause Scheduler"}
          </button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="grid two">
        <div className="card">
          <h2>Scheduler Leader</h2>
          <div className="stack">
            <div className="metric">
              <div>
                <p className="label">Leader Node</p>
                <p className="value">{leaderId || "none"}</p>
              </div>
              <div>
                <p className="label">Local Node</p>
                <p className="meta">{nodeId || "starting"}</p>
              </div>
            </div>
            <div className="pill-group">
              {nodes.map((node) => (
                <span key={node.id} className="pill">
                  {node.id} · TTL {Math.max(0, Math.floor((node.expiresAt - Date.now()) / 1000))}s
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <h2>Create Job</h2>
          <form className="form" onSubmit={onCreateJob}>
            <label>
              Tenant ID
              <input
                value={jobForm.tenantId}
                onChange={(e) => setJobForm({ ...jobForm, tenantId: e.target.value })}
              />
            </label>
            <label>
              Job Name
              <input
                value={jobForm.name}
                onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })}
              />
            </label>
            <label>
              Run At (ISO timestamp)
              <input
                value={jobForm.runAt}
                onChange={(e) => setJobForm({ ...jobForm, runAt: e.target.value })}
              />
            </label>
            <label>
              Payload (JSON)
              <textarea
                rows="5"
                value={jobForm.payload}
                onChange={(e) => setJobForm({ ...jobForm, payload: e.target.value })}
              />
            </label>
            <label>
              Max Attempts
              <input
                type="number"
                min="1"
                max="5"
                value={jobForm.maxAttempts}
                onChange={(e) => setJobForm({ ...jobForm, maxAttempts: e.target.value })}
              />
            </label>
            <button className="primary" type="submit">Schedule Job</button>
          </form>
        </div>
      </section>

      <section className="grid three">
        <div className="card">
          <h2>Timing Wheel</h2>
          {queues ? (
            <div className="stack">
              <div className="metric">
                <div>
                  <p className="label">Pointer</p>
                  <p className="value">{queues.wheelPointer}</p>
                </div>
                <div>
                  <p className="label">Deferred Jobs</p>
                  <p className="value">{queues.wheelDepth}</p>
                </div>
              </div>
            </div>
          ) : (
            <p>Loading wheel...</p>
          )}
        </div>

        <div className="card">
          <h2>Status Mix</h2>
          {queues ? (
            <div className="stack">
              {Object.entries(queues.statusCounts || {}).map(([status, count]) => (
                <div key={status} className="metric">
                  <div>
                    <p className="label">{status}</p>
                    <p className="value">{count}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>Loading...</p>
          )}
        </div>

        <div className="card">
          <h2>Shard Load</h2>
          <div className="stack">
            {shards.map((shard) => (
              <div key={shard.id} className="metric">
                <div>
                  <p className="label">{shard.name}</p>
                  <p className="value">{shard.jobs}</p>
                </div>
                <div>
                  <p className="meta">Shard {shard.id}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <h2>Recent Events</h2>
          <div className="event-list">
            {events.slice(0, 8).map((item) => (
              <div key={item.id} className="event">
                <div>
                  <p className="label">{item.type}</p>
                  <p className="meta">{formatTime(item.at)}</p>
                </div>
                <span className="pill">
                  {item.payload?.jobId || item.payload?.nodeId || "system"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Latest Jobs</h2>
          <div className="notification-list">
            {jobs.map((job) => (
              <div key={job.id} className="notification">
                <div>
                  <p className="label">{job.name}</p>
                  <p className="meta">
                    {job.tenantId} · {job.status} · run {formatDate(job.runAt)}
                  </p>
                </div>
                <span className="pill">Shard {job.shardId}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <h2>Executions</h2>
          <div className="notification-list">
            {executions.map((exec) => (
              <div key={exec.id} className="notification">
                <div>
                  <p className="label">{exec.jobId.slice(0, 6)}</p>
                  <p className="meta">
                    {exec.workerId} · {exec.status} · {formatTime(exec.startedAt)}
                  </p>
                </div>
                <span className="pill">{exec.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Operational Notes</h2>
          <ul className="notes">
            <li>Timing wheel batches jobs in 1s slots to smooth herds.</li>
            <li>Leader schedules queued jobs; workers execute with leases.</li>
            <li>Lease expiry triggers re-schedule for at-least-once delivery.</li>
            <li>Shard routing keeps the store scalable per tenant.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
