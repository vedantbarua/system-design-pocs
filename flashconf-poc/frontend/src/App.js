import React, { useMemo, useState } from "react";
import { FeatureFlagProvider, useFeature, useFlagsMeta } from "./featureFlags";
import "./styles.css";

function FlagCard({ title, flagKey, fallback, enabledContent }) {
  const { enabled, ghost, reason } = useFeature(flagKey);

  return (
    <div className={`card ${ghost ? "ghost" : ""}`}>
      <div className="card-header">
        <h3>{title}</h3>
        <span className={`pill ${enabled ? "on" : "off"}`}>
          {ghost ? "Loading" : enabled ? "ON" : "OFF"}
        </span>
      </div>
      <div className="card-body">
        {ghost ? (
          <div className="skeleton" />
        ) : enabled ? (
          enabledContent
        ) : (
          fallback
        )}
      </div>
      <div className="card-footer">Reason: {reason || "default"}</div>
    </div>
  );
}

function Dashboard() {
  const { status, lastUpdated } = useFlagsMeta();

  return (
    <section>
      <div className="status-row">
        <span className={`status ${status}`}>{status.toUpperCase()}</span>
        <span className="timestamp">Last update: {lastUpdated || "pending"}</span>
      </div>
      <div className="grid">
        <FlagCard
          title="New Sidebar"
          flagKey="new-sidebar"
          fallback={<p>Legacy sidebar remains active.</p>}
          enabledContent={<p>New sidebar is live for beta users.</p>}
        />
        <FlagCard
          title="Checkout Flow"
          flagKey="new-checkout-flow"
          fallback={<p>Classic checkout sequence.</p>}
          enabledContent={<p>Streamlined checkout with fewer steps.</p>}
        />
        <FlagCard
          title="Pay Button"
          flagKey="pay-button"
          fallback={<p>Pay button is disabled for this user.</p>}
          enabledContent={<p>Pay button is available.</p>}
        />
      </div>
    </section>
  );
}

export default function App() {
  const [attributes, setAttributes] = useState({
    userId: "user-42",
    country: "US",
    segment: "beta",
    plan: "pro"
  });

  const [clientId] = useState("web-dashboard");

  const attrString = useMemo(() => JSON.stringify(attributes), [attributes]);

  return (
    <div className="app">
      <header>
        <div>
          <p className="eyebrow">FlashConf</p>
          <h1>Distributed Config Engine</h1>
          <p className="subtitle">Targeted rollouts with SSE push + local caching.</p>
        </div>
        <div className="badge">POC</div>
      </header>

      <section className="panel">
        <h2>Client Attributes</h2>
        <div className="form-grid">
          <label>
            User ID
            <input
              value={attributes.userId}
              onChange={(e) => setAttributes({ ...attributes, userId: e.target.value })}
            />
          </label>
          <label>
            Country
            <input
              value={attributes.country}
              onChange={(e) => setAttributes({ ...attributes, country: e.target.value })}
            />
          </label>
          <label>
            Segment
            <input
              value={attributes.segment}
              onChange={(e) => setAttributes({ ...attributes, segment: e.target.value })}
            />
          </label>
          <label>
            Plan
            <input
              value={attributes.plan}
              onChange={(e) => setAttributes({ ...attributes, plan: e.target.value })}
            />
          </label>
        </div>
        <p className="small">These attributes drive the targeting engine and rollouts.</p>
        <p className="small">Snapshot: {attrString}</p>
      </section>

      <FeatureFlagProvider clientId={clientId} attributes={attributes}>
        <Dashboard />
      </FeatureFlagProvider>

      <section className="panel">
        <h2>Admin API Shortcuts</h2>
        <div className="code-block">
          <pre>{`curl -X PUT "http://localhost:8095/admin/flags/new-sidebar" \
  -H "Content-Type: application/json" \
  -d '{"description":"Sidebar UI","enabled":true,"rules":[],"actor":"admin"}'

curl "http://localhost:8095/admin/audit"`}</pre>
        </div>
        <p className="small">Any admin change pushes a fresh ruleset to connected clients.</p>
      </section>
    </div>
  );
}
