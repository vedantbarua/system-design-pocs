import React, { useEffect, useMemo, useState } from "react";

const WS_URL = "ws://localhost:8080/ws";
const API_URL = "http://localhost:8080/api/cluster";

const stateLabels = {
  LEADER: "Leader",
  FOLLOWER: "Follower",
  CANDIDATE: "Candidate",
  DOWN: "Down"
};

function formatMs(value) {
  if (value < 0) return "--";
  return `${Math.round(value)} ms`;
}

export default function App() {
  const [snapshot, setSnapshot] = useState(null);
  const [connection, setConnection] = useState("connecting");

  useEffect(() => {
    let socket;
    let retryTimer;
    let isMounted = true;

    const connect = () => {
      setConnection("connecting");
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        if (!isMounted) return;
        setConnection("connected");
      };

      socket.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const data = JSON.parse(event.data);
          setSnapshot(data);
        } catch (err) {
          console.error("Failed to parse snapshot", err);
        }
      };

      socket.onclose = () => {
        if (!isMounted) return;
        setConnection("disconnected");
        retryTimer = setTimeout(connect, 1200);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    fetch(`${API_URL}/state`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted) setSnapshot(data);
      })
      .catch(() => {});

    connect();

    return () => {
      isMounted = false;
      if (socket) socket.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const nodes = snapshot?.nodes || [];
  const leaderId = snapshot?.leaderId || "none";
  const committedValue = snapshot?.committedValue ?? 0;
  const leaderTerm = snapshot?.leaderTerm ?? 0;

  const ringPositions = useMemo(() => {
    const radius = 160;
    return nodes.map((node, index) => {
      const angle = (index / nodes.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      return { x, y, id: node.id };
    });
  }, [nodes]);

  const handleKillLeader = () => {
    fetch(`${API_URL}/kill-leader`, { method: "POST" }).catch(() => {});
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Fault-Tolerant Leader Election</p>
          <h1>Raft-Inspired Cluster Control Plane</h1>
          <p className="subtitle">
            Watch heartbeats, elections, and leader failover unfold in real time. Kill the leader to
            force a new election without losing committed state.
          </p>
        </div>
        <div className="hero-panel">
          <div>
            <p className="label">Connection</p>
            <p className={`status ${connection}`}>{connection}</p>
          </div>
          <div>
            <p className="label">Leader</p>
            <p className="value">{leaderId}</p>
            <p className="muted">term {leaderTerm}</p>
          </div>
          <div>
            <p className="label">Committed Value</p>
            <p className="value">{committedValue}</p>
            <p className="muted">replicated to followers</p>
          </div>
          <button className="danger" onClick={handleKillLeader}>
            Kill Current Leader
          </button>
        </div>
      </header>

      <section className="cluster">
        <div className="cluster-map">
          <div className="ring" />
          {nodes.map((node, index) => {
            const pos = ringPositions[index] || { x: 0, y: 0 };
            const isLeader = node.id === leaderId && node.state === "LEADER";
            return (
              <div
                key={node.id}
                className={`node ${node.state.toLowerCase()} ${isLeader ? "pulse" : ""}`}
                style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
              >
                <span className="node-id">{node.id}</span>
                <span className="node-state">{stateLabels[node.state]}</span>
                <span className="node-term">term {node.term}</span>
              </div>
            );
          })}
        </div>

        <div className="cluster-details">
          <h2>Node Telemetry</h2>
          <div className="telemetry-grid">
            {nodes.map((node) => (
              <div key={node.id} className="telemetry-card">
                <div className="telemetry-header">
                  <h3>{node.id}</h3>
                  <span className={`chip ${node.state.toLowerCase()}`}>{stateLabels[node.state]}</span>
                </div>
                <div className="telemetry-row">
                  <span>Last heartbeat</span>
                  <span>{formatMs(node.heartbeatAgeMs)}</span>
                </div>
                <div className="telemetry-row">
                  <span>Election timeout</span>
                  <span>{formatMs(node.electionTimeoutMs)}</span>
                </div>
                <div className="telemetry-row">
                  <span>Voted for</span>
                  <span>{node.votedFor || "-"}</span>
                </div>
                <div className="telemetry-row">
                  <span>Replicated value</span>
                  <span>{node.lastLogValue}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
