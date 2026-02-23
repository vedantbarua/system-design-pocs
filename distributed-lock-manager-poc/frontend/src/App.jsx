import { useMemo, useState } from "react";

const DEFAULT_RESOURCE = "inventory:sku-42";

function toJsonBody(resource, payload, workMs) {
  return JSON.stringify({ resource, payload, workMs });
}

function formatState(state) {
  if (!state) return "No state";
  return JSON.stringify(state, null, 2);
}

export default function App() {
  const [resource, setResource] = useState(DEFAULT_RESOURCE);
  const [payload1, setPayload1] = useState("write-from-app-1");
  const [payload2, setPayload2] = useState("write-from-app-2");
  const [work1, setWork1] = useState(3000);
  const [work2, setWork2] = useState(200);
  const [result1, setResult1] = useState(null);
  const [result2, setResult2] = useState(null);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);

  const app1 = useMemo(() => "http://localhost:8081", []);
  const app2 = useMemo(() => "http://localhost:8082", []);

  async function runDemo() {
    setLoading(true);
    setResult1(null);
    setResult2(null);
    try {
      const first = fetch(`${app1}/dlm/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: toJsonBody(resource, payload1, Number(work1))
      }).then((res) => res.json());

      await new Promise((resolve) => setTimeout(resolve, 1800));

      const second = fetch(`${app2}/dlm/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: toJsonBody(resource, payload2, Number(work2))
      }).then((res) => res.json());

      const [r1, r2] = await Promise.all([first, second]);
      setResult1(r1);
      setResult2(r2);
      await refreshState();
    } finally {
      setLoading(false);
    }
  }

  async function refreshState() {
    const res = await fetch(`${app1}/dlm/state?resource=${encodeURIComponent(resource)}`);
    const data = await res.json();
    setState(data);
  }

  return (
    <div className="page">
      <header className="hero">
        <p className="eyebrow">Distributed Lock Manager POC</p>
        <h1>Redis-backed DLM with fencing tokens</h1>
        <p>
          Demonstrates atomic lock acquisition, safe release, and rejection of stale writes with fencing tokens.
        </p>
      </header>

      <section className="panel">
        <h2>Scenario</h2>
        <div className="grid">
          <label>
            Resource
            <input value={resource} onChange={(e) => setResource(e.target.value)} />
          </label>
          <label>
            App 1 payload
            <input value={payload1} onChange={(e) => setPayload1(e.target.value)} />
          </label>
          <label>
            App 1 work (ms)
            <input type="number" value={work1} onChange={(e) => setWork1(e.target.value)} />
          </label>
          <label>
            App 2 payload
            <input value={payload2} onChange={(e) => setPayload2(e.target.value)} />
          </label>
          <label>
            App 2 work (ms)
            <input type="number" value={work2} onChange={(e) => setWork2(e.target.value)} />
          </label>
        </div>
        <div className="actions">
          <button disabled={loading} onClick={runDemo}>
            {loading ? "Running…" : "Run race demo"}
          </button>
          <button onClick={refreshState}>Refresh state</button>
        </div>
      </section>

      <section className="panel two-col">
        <div>
          <h3>App 1 result</h3>
          <pre>{formatState(result1)}</pre>
        </div>
        <div>
          <h3>App 2 result</h3>
          <pre>{formatState(result2)}</pre>
        </div>
      </section>

      <section className="panel">
        <h3>Stored resource state</h3>
        <pre>{formatState(state)}</pre>
      </section>
    </div>
  );
}
