import React, { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:8096/api";

const ITEM_TYPES = [
  { key: "WENT_WELL", label: "Went Well" },
  { key: "DID_NOT_GO_WELL", label: "Did Not Go Well" },
  { key: "IDEA", label: "Ideas" }
];

const emptySummary = { totalItems: 0, totalVotes: 0, actionCompletionRate: 0, topItems: [] };

export default function App() {
  const [teams, setTeams] = useState([]);
  const [sprints, setSprints] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [selectedSprintId, setSelectedSprintId] = useState(null);
  const [board, setBoard] = useState(null);
  const [newTeamName, setNewTeamName] = useState("");
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintStart, setNewSprintStart] = useState("");
  const [newSprintEnd, setNewSprintEnd] = useState("");
  const [itemType, setItemType] = useState("WENT_WELL");
  const [itemText, setItemText] = useState("");
  const [itemAuthor, setItemAuthor] = useState("");
  const [actionOwner, setActionOwner] = useState("Team Lead");
  const [actionDueDate, setActionDueDate] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const summary = board?.summary || emptySummary;

  const itemsByType = useMemo(() => {
    const base = {};
    ITEM_TYPES.forEach((type) => {
      base[type.key] = board?.itemsByType?.[type.key] || [];
    });
    return base;
  }, [board]);

  const fetchJson = async (url, options) => {
    const res = await fetch(url, options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || `Request failed (${res.status})`);
    }
    if (res.status === 204) {
      return null;
    }
    return res.json();
  };

  const loadTeams = async () => {
    setLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/teams`);
      setTeams(data);
      if (data.length > 0) {
        const current = selectedTeamId && data.some((team) => team.id === selectedTeamId);
        if (!current) {
          setSelectedTeamId(data[0].id);
        }
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSprints = async (teamId) => {
    if (!teamId) return;
    setLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/teams/${teamId}/sprints`);
      setSprints(data);
      if (data.length > 0) {
        const current = selectedSprintId && data.some((sprint) => sprint.id === selectedSprintId);
        if (!current) {
          setSelectedSprintId(data[0].id);
        }
      } else {
        setSelectedSprintId(null);
        setBoard(null);
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadBoard = async (sprintId) => {
    if (!sprintId) return;
    setLoading(true);
    try {
      const data = await fetchJson(`${API_BASE}/sprints/${sprintId}/board`);
      setBoard(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (!actionDueDate) {
      const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
      setActionDueDate(twoWeeks.toISOString().slice(0, 10));
    }
  }, [actionDueDate]);

  useEffect(() => {
    if (selectedTeamId) {
      setSelectedSprintId(null);
      setBoard(null);
      loadSprints(selectedTeamId);
    }
  }, [selectedTeamId]);

  useEffect(() => {
    if (selectedSprintId) {
      loadBoard(selectedSprintId);
    }
  }, [selectedSprintId]);

  const createTeam = async (event) => {
    event.preventDefault();
    if (!newTeamName.trim()) return;
    await fetchJson(`${API_BASE}/teams`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newTeamName.trim() })
    });
    setNewTeamName("");
    await loadTeams();
  };

  const createSprint = async (event) => {
    event.preventDefault();
    if (!selectedTeamId || !newSprintName.trim() || !newSprintStart || !newSprintEnd) return;
    await fetchJson(`${API_BASE}/teams/${selectedTeamId}/sprints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newSprintName.trim(),
        startDate: newSprintStart,
        endDate: newSprintEnd
      })
    });
    setNewSprintName("");
    await loadSprints(selectedTeamId);
  };

  const addItem = async (event) => {
    event.preventDefault();
    if (!selectedSprintId || !itemText.trim() || !itemAuthor.trim()) return;
    await fetchJson(`${API_BASE}/sprints/${selectedSprintId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: itemType,
        text: itemText.trim(),
        author: itemAuthor.trim()
      })
    });
    setItemText("");
    await loadBoard(selectedSprintId);
  };

  const voteItem = async (itemId, delta) => {
    await fetchJson(`${API_BASE}/items/${itemId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ delta })
    });
    await loadBoard(selectedSprintId);
  };

  const convertToAction = async (itemId) => {
    const payload = {
      owner: actionOwner || "Team",
      dueDate: actionDueDate || null,
      overrideText: null
    };
    await fetchJson(`${API_BASE}/items/${itemId}/convert-action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    await loadBoard(selectedSprintId);
  };

  const toggleAction = async (actionId, done) => {
    await fetchJson(`${API_BASE}/action-items/${actionId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done })
    });
    await loadBoard(selectedSprintId);
  };

  const completionPercent = Math.round(summary.actionCompletionRate * 100);

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Sprint Retrospective POC</p>
          <h1>Capture team signals, vote on impact, ship actions fast.</h1>
          <p className="subhead">
            Lightweight in-memory backend with React board for notes, votes, and action follow-through.
          </p>
        </div>
        <div className="hero-card">
          <div>
            <span className="label">Active Team</span>
            <strong>{board?.team?.name || "Select a team"}</strong>
          </div>
          <div>
            <span className="label">Sprint</span>
            <strong>{board?.sprint?.name || "Select a sprint"}</strong>
          </div>
          <div>
            <span className="label">Action Completion</span>
            <strong>{completionPercent}%</strong>
          </div>
        </div>
      </header>

      <section className="panel split">
        <div>
          <h2>Teams</h2>
          <div className="select-row">
            <select value={selectedTeamId || ""} onChange={(e) => setSelectedTeamId(Number(e.target.value))}>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
            <button onClick={loadTeams} type="button">Refresh</button>
          </div>
          <form onSubmit={createTeam} className="inline-form">
            <input
              placeholder="New team name"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
            />
            <button type="submit">Create</button>
          </form>
        </div>
        <div>
          <h2>Sprints</h2>
          <div className="select-row">
            <select value={selectedSprintId || ""} onChange={(e) => setSelectedSprintId(Number(e.target.value))}>
              {sprints.map((sprint) => (
                <option key={sprint.id} value={sprint.id}>{sprint.name}</option>
              ))}
            </select>
            <button onClick={() => loadSprints(selectedTeamId)} type="button">Refresh</button>
          </div>
          <form onSubmit={createSprint} className="grid-form">
            <input
              placeholder="Sprint name"
              value={newSprintName}
              onChange={(e) => setNewSprintName(e.target.value)}
            />
            <input
              type="date"
              value={newSprintStart}
              onChange={(e) => setNewSprintStart(e.target.value)}
            />
            <input
              type="date"
              value={newSprintEnd}
              onChange={(e) => setNewSprintEnd(e.target.value)}
            />
            <button type="submit">Add Sprint</button>
          </form>
        </div>
      </section>

      <section className="panel">
        <h2>Add Retro Item</h2>
        <form onSubmit={addItem} className="grid-form">
          <select value={itemType} onChange={(e) => setItemType(e.target.value)}>
            {ITEM_TYPES.map((type) => (
              <option key={type.key} value={type.key}>{type.label}</option>
            ))}
          </select>
          <input
            placeholder="What happened?"
            value={itemText}
            onChange={(e) => setItemText(e.target.value)}
          />
          <input
            placeholder="Author"
            value={itemAuthor}
            onChange={(e) => setItemAuthor(e.target.value)}
          />
          <button type="submit">Post</button>
        </form>
      </section>

      <section className="board-grid">
        {ITEM_TYPES.map((type) => (
          <div className="panel" key={type.key}>
            <h3>{type.label}</h3>
            <div className="items">
              {itemsByType[type.key].length === 0 && <p className="empty">No notes yet.</p>}
              {itemsByType[type.key].map((item) => (
                <div className="item" key={item.id}>
                  <div>
                    <p>{item.text}</p>
                    <span className="meta">{item.author}</span>
                  </div>
                  <div className="item-actions">
                    <span className="votes">{item.votes}</span>
                    <button type="button" onClick={() => voteItem(item.id, 1)}>+1</button>
                    <button type="button" onClick={() => voteItem(item.id, -1)}>-1</button>
                    <button
                      type="button"
                      className={item.actionItemId ? "disabled" : ""}
                      onClick={() => convertToAction(item.id)}
                      disabled={Boolean(item.actionItemId)}
                    >
                      {item.actionItemId ? "Actioned" : "Make Action"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="panel split">
        <div>
          <h2>Action Items</h2>
          <div className="action-meta">
            <div>
              <span className="label">Owner</span>
              <input value={actionOwner} onChange={(e) => setActionOwner(e.target.value)} />
            </div>
            <div>
              <span className="label">Due Date</span>
              <input type="date" value={actionDueDate} onChange={(e) => setActionDueDate(e.target.value)} />
            </div>
          </div>
          <div className="items">
            {(board?.actionItems || []).length === 0 && <p className="empty">No action items yet.</p>}
            {(board?.actionItems || []).map((action) => (
              <div className="item" key={action.id}>
                <div>
                  <p>{action.text}</p>
                  <span className="meta">Owner: {action.owner} • Due: {action.dueDate || "TBD"}</span>
                </div>
                <button
                  type="button"
                  className={action.status === "DONE" ? "done" : ""}
                  onClick={() => toggleAction(action.id, action.status !== "DONE")}
                >
                  {action.status === "DONE" ? "Done" : "Mark Done"}
                </button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2>Summary</h2>
          <div className="summary">
            <div>
              <span className="label">Items</span>
              <strong>{summary.totalItems}</strong>
            </div>
            <div>
              <span className="label">Votes</span>
              <strong>{summary.totalVotes}</strong>
            </div>
            <div>
              <span className="label">Completion</span>
              <strong>{completionPercent}%</strong>
            </div>
          </div>
          <div className="top-items">
            <h3>Top Signals</h3>
            {summary.topItems.length === 0 && <p className="empty">Vote to highlight key signals.</p>}
            {summary.topItems.map((item) => (
              <div className="top-item" key={item.id}>
                <span className="pill">{item.type.replaceAll("_", " ")}</span>
                <p>{item.text}</p>
                <span className="votes">{item.votes} votes</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="toast">{error}</div>}
      {loading && <div className="toast">Loading…</div>}
    </div>
  );
}
