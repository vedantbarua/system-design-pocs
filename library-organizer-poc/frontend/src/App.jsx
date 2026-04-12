import { useEffect, useMemo, useState } from "react";

const DEFAULT_BOOK = {
  title: "",
  author: "",
  category: "fiction",
  publishedYear: "2024",
  tags: "new, staff-pick",
  condition: "good"
};

function formatTime(epochMs) {
  if (!epochMs) return "-";
  return new Date(epochMs).toLocaleTimeString();
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

function statusClass(status) {
  if (status === "available") return "badge success";
  if (status === "checked_out") return "badge warn";
  if (status === "on_hold") return "badge info";
  if (status === "waiting") return "badge warn";
  if (status === "ready") return "badge success";
  if (status === "released") return "badge muted";
  return "badge";
}

export default function App() {
  const [metrics, setMetrics] = useState(null);
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [holds, setHolds] = useState([]);
  const [loans, setLoans] = useState([]);
  const [events, setEvents] = useState([]);
  const [query, setQuery] = useState("");
  const [bookForm, setBookForm] = useState(DEFAULT_BOOK);
  const [selectedBookId, setSelectedBookId] = useState("");
  const [patronName, setPatronName] = useState("Alex Rivera");
  const [newCategory, setNewCategory] = useState("technology");
  const [error, setError] = useState(null);

  const selectedBook = useMemo(
    () => books.find((book) => book.id === selectedBookId),
    [books, selectedBookId]
  );

  const loadAll = async () => {
    const [metricsRes, booksRes, categoriesRes, holdsRes, loansRes, eventsRes] = await Promise.all([
      fetch("/api/metrics"),
      query ? fetch(`/api/books/search?q=${encodeURIComponent(query)}`) : fetch("/api/books"),
      fetch("/api/categories"),
      fetch("/api/holds"),
      fetch("/api/loans"),
      fetch("/api/events")
    ]);
    const [metricsData, booksData, categoriesData, holdsData, loansData, eventsData] =
      await Promise.all([
        metricsRes.json(),
        booksRes.json(),
        categoriesRes.json(),
        holdsRes.json(),
        loansRes.json(),
        eventsRes.json()
      ]);

    setMetrics(metricsData);
    setBooks(booksData);
    setCategories(categoriesData);
    setHolds(holdsData);
    setLoans(loansData);
    setEvents(eventsData);
    if (!selectedBookId && booksData.length > 0) {
      setSelectedBookId(booksData[0].id);
    }
  };

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 2500);
    return () => clearInterval(interval);
  }, [query]);

  const submitBook = async (event) => {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bookForm)
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Unable to add book");
      return;
    }
    setBookForm(DEFAULT_BOOK);
    await loadAll();
  };

  const mutateBook = async (path, payload = {}) => {
    if (!selectedBookId) return;
    setError(null);
    const response = await fetch(`/api/books/${selectedBookId}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error || "Action failed");
    }
    await loadAll();
  };

  const releaseHold = async (holdId) => {
    await fetch(`/api/holds/${holdId}/release`, { method: "POST" });
    await loadAll();
  };

  const resetSeed = async () => {
    await fetch("/api/seed", { method: "POST" });
    setQuery("");
    await loadAll();
  };

  return (
    <main className="app">
      <header className="header">
        <div>
          <p className="eyebrow">Library Organizer</p>
          <h1>Catalog, place, lend, and rebalance books from one operations board.</h1>
          <p className="subtitle">
            Intake assigns call numbers and shelves automatically. Circulation events update holds,
            loans, search index state, and shelf capacity pressure in real time.
          </p>
        </div>
        <button className="ghost" onClick={resetSeed}>Reset demo data</button>
      </header>

      {error && <div className="error">{error}</div>}

      <section className="metrics">
        <Metric label="Cataloged" value={metrics?.totalBooks || 0} />
        <Metric label="Available" value={metrics?.available || 0} />
        <Metric label="Checked out" value={metrics?.checkedOut || 0} />
        <Metric label="Active holds" value={metrics?.activeHolds || 0} />
        <Metric label="Index terms" value={metrics?.indexTerms || 0} />
      </section>

      <section className="layout">
        <div className="panel wide">
          <div className="panel-heading">
            <div>
              <h2>Catalog Search</h2>
              <p>Search title, author, category, or tags.</p>
            </div>
            <input
              className="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try systems, space, Le Guin..."
            />
          </div>
          <div className="book-grid">
            {books.map((book) => (
              <button
                key={book.id}
                className={book.id === selectedBookId ? "book selected" : "book"}
                onClick={() => setSelectedBookId(book.id)}
              >
                <span className={statusClass(book.status)}>{book.status.replace("_", " ")}</span>
                <strong>{book.title}</strong>
                <span>{book.author}</span>
                <span className="meta">{book.callNumber} · {book.shelfId}</span>
              </button>
            ))}
          </div>
        </div>

        <aside className="panel">
          <h2>Book Actions</h2>
          {selectedBook ? (
            <div className="stack">
              <div>
                <p className="label">Selected</p>
                <h3>{selectedBook.title}</h3>
                <p className="meta">{selectedBook.callNumber} in {selectedBook.shelfId}</p>
              </div>
              <label>
                Patron name
                <input value={patronName} onChange={(event) => setPatronName(event.target.value)} />
              </label>
              <div className="button-row">
                <button
                  className="primary"
                  onClick={() => mutateBook("checkout", { patronName })}
                  disabled={selectedBook.status !== "available"}
                >
                  Check out
                </button>
                <button className="ghost" onClick={() => mutateBook("return")}>Return</button>
                <button className="ghost" onClick={() => mutateBook("holds", { patronName })}>
                  Place hold
                </button>
              </div>
              <label>
                Reclassify shelf
                <select value={newCategory} onChange={(event) => setNewCategory(event.target.value)}>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
              <button className="ghost" onClick={() => mutateBook("reclassify", { category: newCategory })}>
                Move and rebuild call number
              </button>
            </div>
          ) : (
            <p className="meta">Select a book to manage circulation.</p>
          )}
        </aside>
      </section>

      <section className="layout">
        <form className="panel" onSubmit={submitBook}>
          <h2>Intake Book</h2>
          <label>
            Title
            <input
              value={bookForm.title}
              onChange={(event) => setBookForm({ ...bookForm, title: event.target.value })}
              placeholder="Book title"
            />
          </label>
          <label>
            Author
            <input
              value={bookForm.author}
              onChange={(event) => setBookForm({ ...bookForm, author: event.target.value })}
              placeholder="Author"
            />
          </label>
          <div className="split">
            <label>
              Category
              <select
                value={bookForm.category}
                onChange={(event) => setBookForm({ ...bookForm, category: event.target.value })}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
            <label>
              Year
              <input
                value={bookForm.publishedYear}
                onChange={(event) => setBookForm({ ...bookForm, publishedYear: event.target.value })}
              />
            </label>
          </div>
          <label>
            Tags
            <input
              value={bookForm.tags}
              onChange={(event) => setBookForm({ ...bookForm, tags: event.target.value })}
            />
          </label>
          <button className="primary">Catalog and place</button>
        </form>

        <div className="panel wide">
          <div className="panel-heading">
            <div>
              <h2>Shelf Utilization</h2>
              <p>Capacity pressure drives the rebalance plan.</p>
            </div>
          </div>
          <div className="shelf-grid">
            {(metrics?.shelfUtilization || []).map((shelf) => (
              <div className="shelf" key={shelf.id}>
                <div className="shelf-top">
                  <strong>{shelf.name}</strong>
                  <span>{shelf.pressure}%</span>
                </div>
                <div className="bar">
                  <span style={{ width: `${Math.min(100, shelf.pressure)}%` }} />
                </div>
                <p className="meta">{shelf.books.length} of {shelf.capacity} slots · Zone {shelf.zone}</p>
              </div>
            ))}
          </div>
          <div className="rebalance">
            <h3>Rebalance Plan</h3>
            {(metrics?.rebalancePlan || []).length === 0 ? (
              <p className="meta">No shelf is above the pressure threshold.</p>
            ) : (
              metrics.rebalancePlan.map((plan) => (
                <div key={plan.shelfId} className="notice">
                  <strong>{plan.shelfId}: {plan.suggestedAction}</strong>
                  <span>{plan.currentCount}/{plan.capacity} books</span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="layout">
        <div className="panel">
          <h2>Holds</h2>
          <div className="list">
            {holds.slice(0, 8).map((hold) => (
              <div className="row" key={hold.id}>
                <div>
                  <strong>{hold.book?.title || "Unknown book"}</strong>
                  <p className="meta">{hold.patronName}</p>
                </div>
                <div className="right">
                  <span className={statusClass(hold.status)}>{hold.status}</span>
                  {hold.status !== "released" && (
                    <button className="mini" onClick={() => releaseHold(hold.id)}>Release</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Loans</h2>
          <div className="list">
            {loans.slice(0, 8).map((loan) => (
              <div className="row" key={loan.id}>
                <div>
                  <strong>{loan.book?.title || "Unknown book"}</strong>
                  <p className="meta">{loan.patronName} · due {formatDate(loan.dueAt)}</p>
                </div>
                <span className={statusClass(loan.status)}>{loan.status}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <h2>Recent Events</h2>
          <div className="list">
            {events.slice(0, 10).map((event) => (
              <div className="event" key={event.id}>
                <span>{event.type}</span>
                <span className="meta">{formatTime(event.at)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}
