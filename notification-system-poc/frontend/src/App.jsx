import { useEffect, useMemo, useState } from "react";

const DEFAULT_TEMPLATE = {
  name: "",
  channel: "email",
  subject: "",
  body: "",
  variables: ""
};

const DEFAULT_NOTIFICATION = {
  userId: "user-1024",
  channel: "email",
  templateId: "",
  priority: 3,
  params: "{\n  \"name\": \"Alex\",\n  \"orderId\": \"A-9021\",\n  \"eta\": \"2 days\"\n}",
  dedupeKey: ""
};

function formatTime(epochMs) {
  if (!epochMs) return "-";
  const date = new Date(epochMs);
  return date.toLocaleTimeString();
}

function statusBadge(status) {
  switch (status) {
    case "delivered":
      return "badge success";
    case "failed":
      return "badge danger";
    case "deduped":
      return "badge subtle";
    case "sending":
      return "badge warn";
    case "retrying":
      return "badge warn";
    default:
      return "badge";
  }
}

export default function App() {
  const [templates, setTemplates] = useState([]);
  const [providers, setProviders] = useState([]);
  const [queues, setQueues] = useState(null);
  const [events, setEvents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [templateForm, setTemplateForm] = useState(DEFAULT_TEMPLATE);
  const [notificationForm, setNotificationForm] = useState(DEFAULT_NOTIFICATION);
  const [error, setError] = useState(null);
  const [paused, setPaused] = useState(false);
  const [rateEdits, setRateEdits] = useState({});

  const templateOptions = useMemo(
    () =>
      templates.map((template) => ({
        label: `${template.name} (${template.channel})`,
        value: template.id
      })),
    [templates]
  );

  useEffect(() => {
    const match = templates.find((template) => template.id === notificationForm.templateId);
    if (match && notificationForm.channel !== match.channel) {
      setNotificationForm((prev) => ({ ...prev, channel: match.channel }));
    }
  }, [templates, notificationForm.templateId]);

  const loadTemplates = async () => {
    const res = await fetch("/api/templates");
    const data = await res.json();
    setTemplates(data);
    if (!notificationForm.templateId && data.length > 0) {
      setNotificationForm((prev) => ({ ...prev, templateId: data[0].id }));
    }
  };

  const loadProviders = async () => {
    const res = await fetch("/api/providers");
    const data = await res.json();
    setProviders(data);
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

  const loadNotifications = async () => {
    const res = await fetch("/api/notifications?limit=30");
    const data = await res.json();
    setNotifications(data);
  };

  useEffect(() => {
    loadTemplates();
    loadProviders();
    loadQueues();
    loadEvents();
    loadNotifications();

    const intervalFast = setInterval(() => {
      loadQueues();
      loadEvents();
      loadNotifications();
    }, 1200);

    const intervalSlow = setInterval(() => {
      loadProviders();
      loadTemplates();
    }, 5000);

    return () => {
      clearInterval(intervalFast);
      clearInterval(intervalSlow);
    };
  }, []);

  const onCreateTemplate = async (event) => {
    event.preventDefault();
    setError(null);
    const payload = {
      ...templateForm,
      variables: templateForm.variables
        ? templateForm.variables.split(",").map((item) => item.trim()).filter(Boolean)
        : []
    };

    const res = await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create template");
      return;
    }

    setTemplateForm(DEFAULT_TEMPLATE);
    loadTemplates();
  };

  const onCreateNotification = async (event) => {
    event.preventDefault();
    setError(null);
    let parsed = {};
    try {
      parsed = notificationForm.params ? JSON.parse(notificationForm.params) : {};
    } catch (err) {
      setError("Params must be valid JSON");
      return;
    }

    const payload = {
      ...notificationForm,
      params: parsed
    };

    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create notification");
      return;
    }

    loadQueues();
    loadEvents();
    loadNotifications();
  };

  const onSeed = async () => {
    await fetch("/api/seed", { method: "POST" });
    loadTemplates();
  };

  const onPauseToggle = async () => {
    if (paused) {
      await fetch("/api/controls/resume", { method: "POST" });
    } else {
      await fetch("/api/controls/pause", { method: "POST" });
    }
    loadQueues();
  };

  const onRateSave = async (providerId) => {
    const edit = rateEdits[providerId];
    if (!edit || !edit.ratePerSec) return;

    await fetch(`/api/providers/${providerId}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ratePerSec: Number(edit.ratePerSec),
        burst: Number(edit.burst || edit.ratePerSec)
      })
    });

    setRateEdits((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
    loadProviders();
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Notification System POC</p>
          <h1>Pub/Sub at Scale with Priority Queues</h1>
          <p className="subtitle">
            Multi-channel engine that routes SMS, Email, and Push with provider rate limits,
            template rendering, and deduplication windows.
          </p>
        </div>
        <div className="hero-actions">
          <button className="ghost" onClick={onSeed}>Seed Templates</button>
          <button className={paused ? "primary" : "danger"} onClick={onPauseToggle}>
            {paused ? "Resume Dispatch" : "Pause Dispatch"}
          </button>
        </div>
      </header>

      {error ? <div className="error">{error}</div> : null}

      <section className="grid two">
        <div className="card">
          <h2>Create Template</h2>
          <form onSubmit={onCreateTemplate} className="form">
            <label>
              Name
              <input
                value={templateForm.name}
                onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                placeholder="Order Confirmation"
              />
            </label>
            <label>
              Channel
              <select
                value={templateForm.channel}
                onChange={(e) => setTemplateForm({ ...templateForm, channel: e.target.value })}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="push">Push</option>
              </select>
            </label>
            <label>
              Subject (optional)
              <input
                value={templateForm.subject}
                onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                placeholder="Your order {{orderId}} is confirmed"
              />
            </label>
            <label>
              Body
              <textarea
                rows="4"
                value={templateForm.body}
                onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                placeholder="Hi {{name}}, your order {{orderId}} ships in {{eta}}."
              />
            </label>
            <label>
              Variables (comma separated)
              <input
                value={templateForm.variables}
                onChange={(e) => setTemplateForm({ ...templateForm, variables: e.target.value })}
                placeholder="name, orderId, eta"
              />
            </label>
            <button className="primary" type="submit">Create Template</button>
          </form>
        </div>

        <div className="card">
          <h2>Send Notification</h2>
          <form onSubmit={onCreateNotification} className="form">
            <label>
              User ID
              <input
                value={notificationForm.userId}
                onChange={(e) => setNotificationForm({ ...notificationForm, userId: e.target.value })}
              />
            </label>
            <label>
              Template
              <select
                value={notificationForm.templateId}
                onChange={(e) => setNotificationForm({ ...notificationForm, templateId: e.target.value })}
              >
                {templateOptions.length === 0 ? (
                  <option value="">No templates yet</option>
                ) : (
                  templateOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label>
              Channel
              <select
                value={notificationForm.channel}
                onChange={(e) => setNotificationForm({ ...notificationForm, channel: e.target.value })}
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="push">Push</option>
              </select>
            </label>
            <label>
              Priority (1-5)
              <input
                type="number"
                min="1"
                max="5"
                value={notificationForm.priority}
                onChange={(e) =>
                  setNotificationForm({ ...notificationForm, priority: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Dedupe Key (optional)
              <input
                value={notificationForm.dedupeKey}
                onChange={(e) => setNotificationForm({ ...notificationForm, dedupeKey: e.target.value })}
                placeholder="order-A-9021"
              />
            </label>
            <label>
              Params (JSON)
              <textarea
                rows="6"
                value={notificationForm.params}
                onChange={(e) => setNotificationForm({ ...notificationForm, params: e.target.value })}
              />
            </label>
            <button className="primary" type="submit">Enqueue</button>
          </form>
        </div>
      </section>

      <section className="grid three">
        <div className="card">
          <h2>Queue Depths</h2>
          {queues ? (
            <div className="stack">
              {Object.entries(queues.queues || {}).map(([channel, data]) => (
                <div key={channel} className="metric">
                  <div>
                    <p className="label">{channel.toUpperCase()}</p>
                    <p className="value">{data.depth}</p>
                  </div>
                  <div className="pill-group">
                    {Object.entries(data.byPriority).map(([priority, count]) => (
                      <span key={priority} className="pill">
                        P{priority}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p>Loading queues...</p>
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
            <p>Loading statuses...</p>
          )}
        </div>

        <div className="card">
          <h2>Recent Events</h2>
          <div className="event-list">
            {events.slice(0, 8).map((eventItem) => (
              <div key={eventItem.id} className="event">
                <div>
                  <p className="label">{eventItem.type}</p>
                  <p className="meta">{formatTime(eventItem.at)}</p>
                </div>
                <span className="pill">{eventItem.payload?.channel || eventItem.payload?.providerId || "system"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <h2>Providers & Rate Limits</h2>
          <div className="stack">
            {providers.map((provider) => (
              <div key={provider.id} className="provider">
                <div>
                  <p className="label">{provider.name}</p>
                  <p className="meta">{provider.channel.toUpperCase()}</p>
                </div>
                <div>
                  <p className="value">{provider.ratePerSec}/sec</p>
                  <p className="meta">Burst {provider.burst} · Tokens {provider.tokens}</p>
                </div>
                <div className="rate-controls">
                  <input
                    type="number"
                    min="1"
                    placeholder="rate"
                    value={rateEdits[provider.id]?.ratePerSec || ""}
                    onChange={(e) =>
                      setRateEdits((prev) => ({
                        ...prev,
                        [provider.id]: {
                          ...prev[provider.id],
                          ratePerSec: e.target.value
                        }
                      }))
                    }
                  />
                  <input
                    type="number"
                    min="1"
                    placeholder="burst"
                    value={rateEdits[provider.id]?.burst || ""}
                    onChange={(e) =>
                      setRateEdits((prev) => ({
                        ...prev,
                        [provider.id]: {
                          ...prev[provider.id],
                          burst: e.target.value
                        }
                      }))
                    }
                  />
                  <button className="ghost" onClick={() => onRateSave(provider.id)}>
                    Update
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Latest Notifications</h2>
          <div className="notification-list">
            {notifications.map((note) => (
              <div key={note.id} className="notification">
                <div>
                  <p className="label">{note.userId}</p>
                  <p className="meta">
                    {note.channel.toUpperCase()} · P{note.priority} · {formatTime(note.createdAt)}
                  </p>
                </div>
                <div className={statusBadge(note.status)}>{note.status}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
