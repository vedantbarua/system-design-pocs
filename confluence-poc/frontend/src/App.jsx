import React, { useEffect, useMemo, useState } from "react";

const api = (path) => `/api${path}`;

const fetchJson = async (path, options = {}) => {
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    const message = payload.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
};

const defaultPageDraft = {
  title: "",
  body: "",
  labels: "",
  status: "DRAFT"
};

export default function App() {
  const [spaces, setSpaces] = useState([]);
  const [pages, setPages] = useState([]);
  const [activeSpaceId, setActiveSpaceId] = useState(null);
  const [activePage, setActivePage] = useState(null);
  const [comments, setComments] = useState([]);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [recentPages, setRecentPages] = useState([]);
  const [spaceDraft, setSpaceDraft] = useState({ key: "", name: "", owner: "" });
  const [pageDraft, setPageDraft] = useState(defaultPageDraft);
  const [commentDraft, setCommentDraft] = useState({ author: "", text: "" });
  const [status, setStatus] = useState("Ready");

  const activeSpace = useMemo(
    () => spaces.find((space) => space.id === activeSpaceId) || null,
    [spaces, activeSpaceId]
  );

  const loadSpaces = async () => {
    const data = await fetchJson(api("/spaces"));
    setSpaces(data);
    if (!activeSpaceId && data.length) {
      setActiveSpaceId(data[0].id);
    }
  };

  const loadPages = async (spaceId) => {
    if (!spaceId) return;
    const data = await fetchJson(api(`/spaces/${spaceId}/pages`));
    setPages(data);
    if (data.length && (!activePage || activePage.spaceId !== spaceId)) {
      selectPage(data[0].id);
    }
  };

  const loadRecent = async () => {
    const data = await fetchJson(api("/pages/recent?limit=6"));
    setRecentPages(data);
  };

  const loadUsers = async () => {
    const data = await fetchJson(api("/users"));
    setUsers(data);
  };

  const selectPage = async (pageId) => {
    const page = await fetchJson(api(`/pages/${pageId}`));
    setActivePage(page);
    setPageDraft({
      title: page.title,
      body: page.body,
      labels: page.labels.join(", "),
      status: page.status
    });
    const data = await fetchJson(api(`/pages/${pageId}/comments`));
    setComments(data);
  };

  const refresh = async () => {
    try {
      setStatus("Refreshing data...");
      await Promise.all([loadSpaces(), loadRecent(), loadUsers()]);
      if (activeSpaceId) {
        await loadPages(activeSpaceId);
      }
      setStatus("Up to date");
    } catch (error) {
      setStatus(error.message);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (activeSpaceId) {
      loadPages(activeSpaceId).catch((error) => setStatus(error.message));
    }
  }, [activeSpaceId]);

  const handleCreateSpace = async () => {
    try {
      setStatus("Creating space...");
      const payload = {
        key: spaceDraft.key.trim(),
        name: spaceDraft.name.trim(),
        owner: spaceDraft.owner.trim()
      };
      const space = await fetchJson(api("/spaces"), {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setSpaces((prev) => [...prev, space]);
      setActiveSpaceId(space.id);
      setSpaceDraft({ key: "", name: "", owner: "" });
      setStatus("Space created");
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handleCreatePage = async () => {
    if (!activeSpaceId) return;
    try {
      setStatus("Creating page...");
      const payload = {
        title: pageDraft.title.trim(),
        body: pageDraft.body,
        labels: pageDraft.labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        author: users[0]?.name || "Editor"
      };
      const page = await fetchJson(api(`/spaces/${activeSpaceId}/pages`), {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setPages((prev) => [page, ...prev]);
      setActivePage(page);
      setStatus("Page created");
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handleSavePage = async () => {
    if (!activePage) return;
    try {
      setStatus("Saving page...");
      const payload = {
        title: pageDraft.title.trim(),
        body: pageDraft.body,
        labels: pageDraft.labels
          .split(",")
          .map((label) => label.trim())
          .filter(Boolean),
        status: pageDraft.status,
        editor: users[0]?.name || "Editor"
      };
      const page = await fetchJson(api(`/pages/${activePage.id}`), {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setActivePage(page);
      setPages((prev) => prev.map((item) => (item.id === page.id ? page : item)));
      setStatus("Page saved");
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handleAddComment = async () => {
    if (!activePage) return;
    try {
      setStatus("Adding comment...");
      const payload = {
        author: commentDraft.author.trim() || "Anonymous",
        text: commentDraft.text.trim()
      };
      const comment = await fetchJson(api(`/pages/${activePage.id}/comments`), {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setComments((prev) => [...prev, comment]);
      setCommentDraft({ author: "", text: "" });
      setStatus("Comment added");
    } catch (error) {
      setStatus(error.message);
    }
  };

  const handleSearch = async () => {
    try {
      setStatus("Searching...");
      const data = await fetchJson(api(`/pages/search?q=${encodeURIComponent(searchQuery)}`));
      setSearchResults(data);
      setStatus(`Found ${data.length} results`);
    } catch (error) {
      setStatus(error.message);
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <p className="eyebrow">Confluence POC</p>
          <h1>Knowledge for fast-moving teams</h1>
        </div>
        <div className="search">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search pages, labels, keywords"
          />
          <button onClick={handleSearch}>Search</button>
        </div>
      </header>

      <main className="layout">
        <section className="panel spaces">
          <div className="panel-header">
            <h2>Spaces</h2>
            <span className="pill">{spaces.length} active</span>
          </div>
          <ul className="list">
            {spaces.map((space) => (
              <li
                key={space.id}
                className={space.id === activeSpaceId ? "active" : ""}
                onClick={() => setActiveSpaceId(space.id)}
              >
                <div>
                  <strong>{space.key}</strong>
                  <p>{space.name}</p>
                </div>
                <span>{space.pageCount} pages</span>
              </li>
            ))}
          </ul>
          <div className="form">
            <h3>Create space</h3>
            <input
              placeholder="Key"
              value={spaceDraft.key}
              onChange={(event) => setSpaceDraft({ ...spaceDraft, key: event.target.value })}
            />
            <input
              placeholder="Name"
              value={spaceDraft.name}
              onChange={(event) => setSpaceDraft({ ...spaceDraft, name: event.target.value })}
            />
            <input
              placeholder="Owner"
              value={spaceDraft.owner}
              onChange={(event) => setSpaceDraft({ ...spaceDraft, owner: event.target.value })}
            />
            <button onClick={handleCreateSpace}>Add space</button>
          </div>
        </section>

        <section className="panel pages">
          <div className="panel-header">
            <h2>Pages</h2>
            {activeSpace && <span className="pill">{activeSpace.key}</span>}
          </div>
          <ul className="list">
            {pages.map((page) => (
              <li
                key={page.id}
                className={activePage && page.id === activePage.id ? "active" : ""}
                onClick={() => selectPage(page.id)}
              >
                <div>
                  <strong>{page.title}</strong>
                  <p>{page.status} · v{page.version}</p>
                </div>
                <span>{new Date(page.lastUpdatedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
          <div className="form">
            <h3>Draft new page</h3>
            <input
              placeholder="Title"
              value={pageDraft.title}
              onChange={(event) => setPageDraft({ ...pageDraft, title: event.target.value })}
            />
            <input
              placeholder="Labels (comma-separated)"
              value={pageDraft.labels}
              onChange={(event) => setPageDraft({ ...pageDraft, labels: event.target.value })}
            />
            <button onClick={handleCreatePage}>Create page</button>
          </div>
        </section>

        <section className="panel editor">
          <div className="panel-header">
            <h2>Page editor</h2>
            {activePage && <span className="pill">{activePage.status}</span>}
          </div>
          {activePage ? (
            <div className="editor-grid">
              <input
                className="title-input"
                value={pageDraft.title}
                onChange={(event) => setPageDraft({ ...pageDraft, title: event.target.value })}
              />
              <textarea
                value={pageDraft.body}
                onChange={(event) => setPageDraft({ ...pageDraft, body: event.target.value })}
              />
              <div className="inline-controls">
                <input
                  placeholder="Labels"
                  value={pageDraft.labels}
                  onChange={(event) => setPageDraft({ ...pageDraft, labels: event.target.value })}
                />
                <select
                  value={pageDraft.status}
                  onChange={(event) => setPageDraft({ ...pageDraft, status: event.target.value })}
                >
                  <option value="DRAFT">Draft</option>
                  <option value="PUBLISHED">Published</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
                <button onClick={handleSavePage}>Save changes</button>
              </div>
              <div className="meta">
                <p>
                  Last edited by {activePage.lastEditedBy} · v{activePage.version}
                </p>
                <p>
                  Updated {new Date(activePage.lastUpdatedAt).toLocaleString()}
                </p>
              </div>
            </div>
          ) : (
            <p className="empty">Select a page to start editing.</p>
          )}
        </section>

        <section className="panel comments">
          <div className="panel-header">
            <h2>Comments</h2>
            <span className="pill">{comments.length}</span>
          </div>
          <ul className="list">
            {comments.map((comment) => (
              <li key={comment.id}>
                <div>
                  <strong>{comment.author}</strong>
                  <p>{comment.text}</p>
                </div>
                <span>{new Date(comment.createdAt).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
          <div className="form">
            <h3>Add comment</h3>
            <input
              placeholder="Author"
              value={commentDraft.author}
              onChange={(event) => setCommentDraft({ ...commentDraft, author: event.target.value })}
            />
            <textarea
              placeholder="Comment"
              value={commentDraft.text}
              onChange={(event) => setCommentDraft({ ...commentDraft, text: event.target.value })}
            />
            <button onClick={handleAddComment}>Post comment</button>
          </div>
        </section>

        <section className="panel insights">
          <div className="panel-header">
            <h2>Search results</h2>
            <span className="pill">{searchResults.length}</span>
          </div>
          <ul className="list">
            {searchResults.map((page) => (
              <li key={page.id} onClick={() => selectPage(page.id)}>
                <div>
                  <strong>{page.title}</strong>
                  <p>{page.labels.join(" · ")}</p>
                </div>
                <span>{page.status}</span>
              </li>
            ))}
          </ul>
          <div className="panel-header">
            <h2>Recent activity</h2>
            <span className="pill">{recentPages.length}</span>
          </div>
          <ul className="list">
            {recentPages.map((page) => (
              <li key={page.id} onClick={() => selectPage(page.id)}>
                <div>
                  <strong>{page.title}</strong>
                  <p>{page.status} · {page.labels.join(", ")}</p>
                </div>
                <span>{new Date(page.lastUpdatedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="footer">
        <p>Status: {status}</p>
        <button onClick={refresh}>Refresh data</button>
      </footer>
    </div>
  );
}
