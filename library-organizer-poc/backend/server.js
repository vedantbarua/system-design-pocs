import crypto from "node:crypto";
import express from "express";
import cors from "cors";

const PORT = process.env.PORT ? Number(process.env.PORT) : 8134;
const EVENT_LIMIT = 200;
const LOAN_DAYS = 21;

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const shelves = new Map();
const books = new Map();
const holds = [];
const loans = [];
const events = [];
const searchIndex = new Map();

const categories = [
  { id: "fiction", name: "Fiction", prefix: "FIC", zone: "A", capacity: 18 },
  { id: "science", name: "Science", prefix: "SCI", zone: "B", capacity: 14 },
  { id: "history", name: "History", prefix: "HIS", zone: "C", capacity: 12 },
  { id: "technology", name: "Technology", prefix: "TEC", zone: "D", capacity: 12 },
  { id: "arts", name: "Arts", prefix: "ART", zone: "E", capacity: 10 }
];

function now() {
  return Date.now();
}

function daysFromToday(days) {
  return new Date(now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function logEvent(type, payload) {
  events.unshift({
    id: crypto.randomUUID(),
    type,
    payload,
    at: now()
  });
  if (events.length > EVENT_LIMIT) events.pop();
}

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function tokenize(...values) {
  return values
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function indexBook(book) {
  for (const tokenSet of searchIndex.values()) {
    tokenSet.delete(book.id);
  }
  for (const token of tokenize(book.title, book.author, book.category, book.tags.join(" "))) {
    if (!searchIndex.has(token)) searchIndex.set(token, new Set());
    searchIndex.get(token).add(book.id);
  }
}

function categoryById(categoryId) {
  return categories.find((category) => category.id === categoryId) || categories[0];
}

function shelfFor(categoryId) {
  return shelves.get(categoryId);
}

function makeCallNumber(book) {
  const category = categoryById(book.category);
  const authorCode = normalizeText(book.author)
    .replace(/[^a-z]/g, "")
    .slice(0, 3)
    .toUpperCase()
    .padEnd(3, "X");
  return `${category.prefix}-${authorCode}-${String(book.publishedYear || "0000").slice(-2)}`;
}

function currentLoansForBook(bookId) {
  return loans.filter((loan) => loan.bookId === bookId && loan.status === "active");
}

function activeHoldsForBook(bookId) {
  return holds.filter((hold) => hold.bookId === bookId && hold.status === "waiting");
}

function shelfPressure(shelf) {
  return Math.round((shelf.bookIds.length / shelf.capacity) * 100);
}

function serializeBook(book) {
  return {
    ...book,
    activeLoans: currentLoansForBook(book.id).length,
    waitingHolds: activeHoldsForBook(book.id).length
  };
}

function placeBook(book) {
  const shelf = shelfFor(book.category);
  if (!shelf) throw new Error("Unknown category");
  book.shelfId = shelf.id;
  book.status = "available";
  book.callNumber = makeCallNumber(book);
  shelf.bookIds.push(book.id);
  shelf.bookIds.sort((a, b) => {
    const left = books.get(a);
    const right = books.get(b);
    return left.callNumber.localeCompare(right.callNumber);
  });
  indexBook(book);
  logEvent("catalog.placed", {
    bookId: book.id,
    title: book.title,
    shelfId: shelf.id,
    callNumber: book.callNumber,
    pressure: shelfPressure(shelf)
  });
}

function addBook(input) {
  const title = String(input.title || "").trim();
  const author = String(input.author || "").trim();
  if (!title || !author) {
    const error = new Error("title and author are required");
    error.status = 400;
    throw error;
  }

  const book = {
    id: crypto.randomUUID(),
    title,
    author,
    category: input.category || "fiction",
    publishedYear: Number(input.publishedYear || new Date().getFullYear()),
    tags: Array.isArray(input.tags)
      ? input.tags.map(String)
      : String(input.tags || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
    condition: input.condition || "good",
    status: "processing",
    shelfId: null,
    callNumber: null,
    createdAt: now(),
    updatedAt: now()
  };

  books.set(book.id, book);
  placeBook(book);
  return book;
}

function removeBookFromShelf(book) {
  const shelf = shelfFor(book.category);
  if (!shelf) return;
  shelf.bookIds = shelf.bookIds.filter((bookId) => bookId !== book.id);
}

function recatalogBook(bookId, category) {
  const book = books.get(bookId);
  if (!book) return null;
  removeBookFromShelf(book);
  const previousCategory = book.category;
  book.category = category;
  book.updatedAt = now();
  placeBook(book);
  logEvent("catalog.reclassified", {
    bookId,
    from: previousCategory,
    to: category,
    callNumber: book.callNumber
  });
  return book;
}

function searchBooks(query) {
  const clean = normalizeText(query).trim();
  if (!clean) return [...books.values()].map(serializeBook);

  const tokens = tokenize(clean);
  const matchedIds = new Map();
  for (const token of tokens) {
    const exact = searchIndex.get(token);
    if (exact) {
      for (const bookId of exact) matchedIds.set(bookId, (matchedIds.get(bookId) || 0) + 2);
    }
    for (const [indexedToken, ids] of searchIndex.entries()) {
      if (indexedToken.includes(token) && indexedToken !== token) {
        for (const bookId of ids) matchedIds.set(bookId, (matchedIds.get(bookId) || 0) + 1);
      }
    }
  }

  return [...matchedIds.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([bookId]) => serializeBook(books.get(bookId)))
    .filter(Boolean);
}

function checkoutBook(bookId, patronName) {
  const book = books.get(bookId);
  if (!book) return null;
  if (book.status !== "available") {
    const error = new Error("book is not available for checkout");
    error.status = 409;
    throw error;
  }

  const loan = {
    id: crypto.randomUUID(),
    bookId,
    patronName: String(patronName || "Walk-in patron").trim(),
    checkedOutAt: new Date().toISOString(),
    dueAt: daysFromToday(LOAN_DAYS),
    status: "active"
  };
  loans.unshift(loan);
  book.status = "checked_out";
  book.updatedAt = now();
  logEvent("circulation.checked_out", {
    bookId,
    title: book.title,
    patronName: loan.patronName,
    dueAt: loan.dueAt
  });
  return loan;
}

function returnBook(bookId) {
  const book = books.get(bookId);
  if (!book) return null;

  const loan = loans.find((entry) => entry.bookId === bookId && entry.status === "active");
  if (loan) {
    loan.status = "returned";
    loan.returnedAt = new Date().toISOString();
  }

  const nextHold = activeHoldsForBook(bookId).sort((a, b) => a.createdAt - b.createdAt)[0];
  if (nextHold) {
    nextHold.status = "ready";
    nextHold.readyAt = new Date().toISOString();
    book.status = "on_hold";
    logEvent("holds.ready", {
      bookId,
      title: book.title,
      patronName: nextHold.patronName,
      holdId: nextHold.id
    });
  } else {
    book.status = "available";
    logEvent("circulation.returned", { bookId, title: book.title });
  }
  book.updatedAt = now();
  return book;
}

function createHold(bookId, patronName) {
  const book = books.get(bookId);
  if (!book) return null;
  const hold = {
    id: crypto.randomUUID(),
    bookId,
    patronName: String(patronName || "Library patron").trim(),
    status: book.status === "available" ? "ready" : "waiting",
    createdAt: now()
  };
  if (hold.status === "ready") {
    hold.readyAt = new Date().toISOString();
    book.status = "on_hold";
    book.updatedAt = now();
  }
  holds.unshift(hold);
  logEvent("holds.created", {
    bookId,
    title: book.title,
    patronName: hold.patronName,
    status: hold.status
  });
  return hold;
}

function releaseHold(holdId) {
  const hold = holds.find((entry) => entry.id === holdId);
  if (!hold) return null;
  hold.status = "released";
  hold.releasedAt = new Date().toISOString();
  const book = books.get(hold.bookId);
  if (book && book.status === "on_hold") {
    const nextHold = activeHoldsForBook(book.id).sort((a, b) => a.createdAt - b.createdAt)[0];
    if (nextHold) {
      nextHold.status = "ready";
      nextHold.readyAt = new Date().toISOString();
    } else {
      book.status = "available";
    }
    book.updatedAt = now();
  }
  logEvent("holds.released", { holdId, bookId: hold.bookId });
  return hold;
}

function rebalancePlan() {
  const overloaded = [...shelves.values()].filter((shelf) => shelfPressure(shelf) >= 85);
  return overloaded.map((shelf) => ({
    shelfId: shelf.id,
    category: shelf.category,
    pressure: shelfPressure(shelf),
    currentCount: shelf.bookIds.length,
    capacity: shelf.capacity,
    suggestedAction:
      shelf.bookIds.length > shelf.capacity
        ? "Move overflow copies to remote stacks"
        : "Reserve an adjacent bay before the next intake batch",
    candidates: shelf.bookIds.slice(-3).map((bookId) => {
      const book = books.get(bookId);
      return {
        bookId,
        title: book.title,
        callNumber: book.callNumber
      };
    })
  }));
}

function metrics() {
  const statusCounts = [...books.values()].reduce((acc, book) => {
    acc[book.status] = (acc[book.status] || 0) + 1;
    return acc;
  }, {});
  const shelfUtilization = [...shelves.values()].map((shelf) => ({
    ...shelf,
    books: shelf.bookIds.map((bookId) => books.get(bookId)).filter(Boolean).map(serializeBook),
    pressure: shelfPressure(shelf)
  }));
  return {
    totalBooks: books.size,
    available: statusCounts.available || 0,
    checkedOut: statusCounts.checked_out || 0,
    onHold: statusCounts.on_hold || 0,
    activeHolds: holds.filter((hold) => hold.status === "waiting" || hold.status === "ready").length,
    activeLoans: loans.filter((loan) => loan.status === "active").length,
    indexTerms: searchIndex.size,
    shelfUtilization,
    rebalancePlan: rebalancePlan()
  };
}

function seed() {
  shelves.clear();
  books.clear();
  holds.length = 0;
  loans.length = 0;
  events.length = 0;
  searchIndex.clear();

  for (const category of categories) {
    shelves.set(category.id, {
      id: `${category.zone}-${category.prefix}`,
      category: category.id,
      name: `${category.name} Bay`,
      zone: category.zone,
      capacity: category.capacity,
      bookIds: []
    });
  }

  [
    ["The Left Hand of Darkness", "Ursula K. Le Guin", "fiction", 1969, ["classic", "speculative"]],
    ["Project Hail Mary", "Andy Weir", "fiction", 2021, ["space", "popular"]],
    ["The Fifth Season", "N. K. Jemisin", "fiction", 2015, ["fantasy", "award"]],
    ["Dune", "Frank Herbert", "fiction", 1965, ["space", "classic"]],
    ["The Dispossessed", "Ursula K. Le Guin", "fiction", 1974, ["political", "classic"]],
    ["A Brief History of Time", "Stephen Hawking", "science", 1988, ["physics", "cosmology"]],
    ["The Gene", "Siddhartha Mukherjee", "science", 2016, ["biology", "medicine"]],
    ["Silent Spring", "Rachel Carson", "science", 1962, ["environment", "classic"]],
    ["Sapiens", "Yuval Noah Harari", "history", 2011, ["humanity", "popular"]],
    ["The Warmth of Other Suns", "Isabel Wilkerson", "history", 2010, ["migration", "america"]],
    ["Team of Rivals", "Doris Kearns Goodwin", "history", 2005, ["leadership", "america"]],
    ["Designing Data-Intensive Applications", "Martin Kleppmann", "technology", 2017, ["systems", "distributed"]],
    ["Clean Architecture", "Robert C. Martin", "technology", 2017, ["software", "architecture"]],
    ["The Pragmatic Programmer", "Andrew Hunt", "technology", 1999, ["software", "craft"]],
    ["Ways of Seeing", "John Berger", "arts", 1972, ["visual", "criticism"]],
    ["The Story of Art", "E. H. Gombrich", "arts", 1950, ["survey", "classic"]]
  ].forEach(([title, author, category, publishedYear, tags]) => {
    addBook({ title, author, category, publishedYear, tags });
  });

  checkoutBook([...books.values()].find((book) => book.title === "Project Hail Mary").id, "Mina Patel");
  createHold([...books.values()].find((book) => book.title === "Project Hail Mary").id, "Jordan Lee");
  createHold([...books.values()].find((book) => book.title === "Designing Data-Intensive Applications").id, "Riley Chen");
  logEvent("system.seeded", { books: books.size, shelves: shelves.size });
}

seed();

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "library-organizer", timestamp: new Date().toISOString() });
});

app.get("/api/categories", (_req, res) => {
  res.json(categories);
});

app.get("/api/metrics", (_req, res) => {
  res.json(metrics());
});

app.get("/api/books", (req, res) => {
  const category = req.query.category;
  const status = req.query.status;
  const result = [...books.values()]
    .filter((book) => !category || book.category === category)
    .filter((book) => !status || book.status === status)
    .map(serializeBook)
    .sort((a, b) => a.callNumber.localeCompare(b.callNumber));
  res.json(result);
});

app.get("/api/books/search", (req, res) => {
  res.json(searchBooks(req.query.q || ""));
});

app.post("/api/books", (req, res, next) => {
  try {
    res.status(201).json(serializeBook(addBook(req.body || {})));
  } catch (error) {
    next(error);
  }
});

app.post("/api/books/:id/reclassify", (req, res) => {
  const category = req.body?.category;
  if (!categories.some((entry) => entry.id === category)) {
    res.status(400).json({ error: "valid category is required" });
    return;
  }
  const book = recatalogBook(req.params.id, category);
  if (!book) {
    res.status(404).json({ error: "book not found" });
    return;
  }
  res.json(serializeBook(book));
});

app.post("/api/books/:id/checkout", (req, res, next) => {
  try {
    const loan = checkoutBook(req.params.id, req.body?.patronName);
    if (!loan) {
      res.status(404).json({ error: "book not found" });
      return;
    }
    res.status(201).json(loan);
  } catch (error) {
    next(error);
  }
});

app.post("/api/books/:id/return", (req, res) => {
  const book = returnBook(req.params.id);
  if (!book) {
    res.status(404).json({ error: "book not found" });
    return;
  }
  res.json(serializeBook(book));
});

app.post("/api/books/:id/holds", (req, res) => {
  const hold = createHold(req.params.id, req.body?.patronName);
  if (!hold) {
    res.status(404).json({ error: "book not found" });
    return;
  }
  res.status(201).json(hold);
});

app.get("/api/holds", (_req, res) => {
  res.json(
    holds.map((hold) => ({
      ...hold,
      book: books.has(hold.bookId) ? serializeBook(books.get(hold.bookId)) : null
    }))
  );
});

app.post("/api/holds/:id/release", (req, res) => {
  const hold = releaseHold(req.params.id);
  if (!hold) {
    res.status(404).json({ error: "hold not found" });
    return;
  }
  res.json(hold);
});

app.get("/api/loans", (_req, res) => {
  res.json(
    loans.map((loan) => ({
      ...loan,
      book: books.has(loan.bookId) ? serializeBook(books.get(loan.bookId)) : null
    }))
  );
});

app.get("/api/events", (_req, res) => {
  res.json(events);
});

app.post("/api/seed", (_req, res) => {
  seed();
  res.json({ ok: true, ...metrics() });
});

app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({ error: error.message || "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Library organizer API listening on http://localhost:${PORT}`);
});
