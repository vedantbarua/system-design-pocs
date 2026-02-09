import React, { useEffect, useMemo, useRef, useState } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";

const STATUS_ORDER = ["TODO", "IN_PROGRESS", "DONE"];
const STATUS_LABELS = {
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  DONE: "Done"
};

const STATUS_HINTS = {
  TODO: "Queue it up and get ready.",
  IN_PROGRESS: "Active work, live signals.",
  DONE: "Shipped and verified."
};

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ title: "", description: "" });
  const clientRef = useRef(null);

  const columns = useMemo(() => {
    const grouped = {
      TODO: [],
      IN_PROGRESS: [],
      DONE: []
    };
    tasks.forEach((task) => {
      if (grouped[task.status]) {
        grouped[task.status].push(task);
      }
    });
    return grouped;
  }, [tasks]);

  useEffect(() => {
    let active = true;

    async function loadInitial() {
      try {
        const response = await fetch("/api/board");
        if (!response.ok) {
          throw new Error("Failed to load board");
        }
        const payload = await response.json();
        if (active) {
          setTasks(payload.tasks || []);
          setLastUpdated(payload.lastUpdated || null);
        }
      } catch (err) {
        if (active) {
          setError(err.message);
        }
      }
    }

    loadInitial();

    const client = new Client({
      webSocketFactory: () => new SockJS("/ws"),
      reconnectDelay: 2000,
      onConnect: () => {
        setStatus("connected");
        client.subscribe("/topic/board", (message) => {
          const payload = JSON.parse(message.body);
          setTasks(payload.tasks || []);
          setLastUpdated(payload.lastUpdated || null);
        });
      },
      onStompError: (frame) => {
        setStatus("error");
        setError(frame.headers.message || "WebSocket error");
      },
      onWebSocketClose: () => {
        setStatus("connecting");
      }
    });

    client.activate();
    clientRef.current = client;

    return () => {
      active = false;
      client.deactivate();
    };
  }, []);

  async function createTask(event) {
    event.preventDefault();
    setError(null);
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }

    try {
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim()
        })
      });
      if (!response.ok) {
        throw new Error("Failed to create task");
      }
      setForm({ title: "", description: "" });
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveTask(taskId, nextStatus) {
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/move`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus })
      });
      if (!response.ok) {
        throw new Error("Failed to move task");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteTask(taskId) {
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error("Failed to delete task");
      }
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="overline">Traffic Controller + Active Viewer</p>
          <h1>Real-Time Kanban Dashboard</h1>
          <p className="subtitle">
            Spring Boot broadcasts every task change. React listens and redraws instantly.
          </p>
        </div>
        <div className="status-card">
          <div className={`pulse ${status}`} />
          <div>
            <p className="status-label">Live Channel</p>
            <p className="status-value">
              {status === "connected" ? "Streaming" : status === "error" ? "Interrupted" : "Connecting"}
            </p>
            <p className="status-time">Last update {formatTimestamp(lastUpdated)}</p>
          </div>
        </div>
      </header>

      <section className="composer">
        <form onSubmit={createTask}>
          <div className="field">
            <label htmlFor="title">Task title</label>
            <input
              id="title"
              type="text"
              value={form.title}
              placeholder="Design event payloads"
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="description">Description</label>
            <input
              id="description"
              type="text"
              value={form.description}
              placeholder="List the signals you want to stream"
              onChange={(event) => setForm({ ...form, description: event.target.value })}
            />
          </div>
          <button type="submit">Broadcast task</button>
        </form>
        {error ? <p className="error">{error}</p> : null}
      </section>

      <main className="board">
        {STATUS_ORDER.map((statusKey) => (
          <section key={statusKey} className="column">
            <div className="column-head">
              <div>
                <h2>{STATUS_LABELS[statusKey]}</h2>
                <p>{STATUS_HINTS[statusKey]}</p>
              </div>
              <span className="count">{columns[statusKey]?.length || 0}</span>
            </div>
            <div className="cards">
              {columns[statusKey]?.map((task) => (
                <article key={task.id} className="card">
                  <div className="card-header">
                    <h3>{task.title}</h3>
                    <span>{formatTimestamp(task.updatedAt)}</span>
                  </div>
                  {task.description ? <p>{task.description}</p> : null}
                  <div className="card-actions">
                    <div className="move">
                      {statusKey !== "TODO" ? (
                        <button
                          type="button"
                          onClick={() =>
                            moveTask(
                              task.id,
                              STATUS_ORDER[STATUS_ORDER.indexOf(statusKey) - 1]
                            )
                          }
                        >
                          Back
                        </button>
                      ) : null}
                      {statusKey !== "DONE" ? (
                        <button
                          type="button"
                          onClick={() =>
                            moveTask(
                              task.id,
                              STATUS_ORDER[STATUS_ORDER.indexOf(statusKey) + 1]
                            )
                          }
                        >
                          Forward
                        </button>
                      ) : null}
                    </div>
                    <button type="button" className="ghost" onClick={() => deleteTask(task.id)}>
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
