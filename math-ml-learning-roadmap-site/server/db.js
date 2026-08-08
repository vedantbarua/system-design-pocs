import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.resolve("data");
mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, "learning-roadmap.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS learner_progress (
    user_id TEXT PRIMARY KEY,
    active_id TEXT NOT NULL,
    pace TEXT NOT NULL,
    completed_json TEXT NOT NULL,
    bookmarked_json TEXT NOT NULL,
    notes TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS weekly_plans (
    user_id TEXT PRIMARY KEY,
    plan_json TEXT NOT NULL,
    generated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS review_cards (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    step_id TEXT NOT NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    answer TEXT NOT NULL,
    due_at TEXT NOT NULL,
    interval_days INTEGER NOT NULL DEFAULT 1,
    ease REAL NOT NULL DEFAULT 2.5,
    repetitions INTEGER NOT NULL DEFAULT 0,
    last_rating TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_review_cards_due ON review_cards(user_id, due_at);
`);

const defaultProgress = {
  activeId: "algebra",
  pace: "steady",
  completed: ["algebra"],
  bookmarked: ["linear-algebra-intuition"],
  notes: "Pair intuition with mechanics: watch the visual lesson before heavy exercises, then summarize the idea in your own words."
};

export function getProgress(userId) {
  const row = db.prepare("SELECT * FROM learner_progress WHERE user_id = ?").get(userId);
  if (!row) {
    return saveProgress(userId, defaultProgress);
  }

  return {
    userId,
    activeId: row.active_id,
    pace: row.pace,
    completed: JSON.parse(row.completed_json),
    bookmarked: JSON.parse(row.bookmarked_json),
    notes: row.notes,
    updatedAt: row.updated_at
  };
}

export function saveProgress(userId, progress) {
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO learner_progress (user_id, active_id, pace, completed_json, bookmarked_json, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      active_id = excluded.active_id,
      pace = excluded.pace,
      completed_json = excluded.completed_json,
      bookmarked_json = excluded.bookmarked_json,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(
    userId,
    progress.activeId || defaultProgress.activeId,
    progress.pace || defaultProgress.pace,
    JSON.stringify(Array.isArray(progress.completed) ? progress.completed : []),
    JSON.stringify(Array.isArray(progress.bookmarked) ? progress.bookmarked : []),
    typeof progress.notes === "string" ? progress.notes : defaultProgress.notes,
    updatedAt
  );

  return getProgressRow(userId);
}

export function saveWeeklyPlan(userId, plan) {
  const generatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO weekly_plans (user_id, plan_json, generated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan_json = excluded.plan_json,
      generated_at = excluded.generated_at
  `).run(userId, JSON.stringify(plan), generatedAt);
  return { userId, plan, generatedAt };
}

export function getWeeklyPlan(userId) {
  const row = db.prepare("SELECT * FROM weekly_plans WHERE user_id = ?").get(userId);
  if (!row) return { userId, plan: [], generatedAt: null };
  return {
    userId,
    plan: JSON.parse(row.plan_json),
    generatedAt: row.generated_at
  };
}

export function seedReviewCards(userId, cards) {
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO review_cards
      (id, user_id, step_id, title, prompt, answer, due_at, interval_days, ease, repetitions, last_rating, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 2.5, 0, NULL, ?)
  `);

  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card.id || !card.stepId || !card.title || !card.prompt || !card.answer) continue;
    insert.run(`${userId}:${card.id}`, userId, card.stepId, card.title, card.prompt, card.answer, now, now);
  }

  return getDueReviews(userId);
}

export function getDueReviews(userId, limit = 6) {
  const rows = db.prepare(`
    SELECT * FROM review_cards
    WHERE user_id = ? AND due_at <= ?
    ORDER BY due_at ASC, repetitions ASC
    LIMIT ?
  `).all(userId, new Date().toISOString(), Math.max(1, Math.min(Number(limit) || 6, 20)));

  return rows.map(reviewFromRow);
}

export function rateReviewCard(userId, cardId, rating) {
  const row = db.prepare("SELECT * FROM review_cards WHERE user_id = ? AND id = ?").get(userId, cardId);
  if (!row) return null;

  const currentEase = Number(row.ease);
  const currentInterval = Number(row.interval_days);
  const repetitions = Number(row.repetitions);
  const normalizedRating = ["again", "hard", "good", "easy"].includes(rating) ? rating : "good";

  const next = scheduleNextReview({ rating: normalizedRating, ease: currentEase, intervalDays: currentInterval, repetitions });
  const dueAt = new Date(Date.now() + next.intervalDays * 24 * 60 * 60 * 1000).toISOString();
  const updatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE review_cards
    SET due_at = ?, interval_days = ?, ease = ?, repetitions = ?, last_rating = ?, updated_at = ?
    WHERE user_id = ? AND id = ?
  `).run(dueAt, next.intervalDays, next.ease, next.repetitions, normalizedRating, updatedAt, userId, cardId);

  return reviewFromRow(db.prepare("SELECT * FROM review_cards WHERE user_id = ? AND id = ?").get(userId, cardId));
}

function scheduleNextReview({ rating, ease, intervalDays, repetitions }) {
  if (rating === "again") {
    return { intervalDays: 1, ease: Math.max(1.3, ease - 0.25), repetitions: 0 };
  }
  if (rating === "hard") {
    return { intervalDays: Math.max(2, Math.ceil(intervalDays * 1.2)), ease: Math.max(1.3, ease - 0.1), repetitions: repetitions + 1 };
  }
  if (rating === "easy") {
    return { intervalDays: Math.max(4, Math.ceil(intervalDays * (ease + 0.35))), ease: ease + 0.15, repetitions: repetitions + 1 };
  }
  return { intervalDays: Math.max(3, Math.ceil(intervalDays * ease)), ease, repetitions: repetitions + 1 };
}

function reviewFromRow(row) {
  return {
    id: row.id,
    stepId: row.step_id,
    title: row.title,
    prompt: row.prompt,
    answer: row.answer,
    dueAt: row.due_at,
    intervalDays: row.interval_days,
    ease: row.ease,
    repetitions: row.repetitions,
    lastRating: row.last_rating,
    updatedAt: row.updated_at
  };
}

function getProgressRow(userId) {
  const row = db.prepare("SELECT * FROM learner_progress WHERE user_id = ?").get(userId);
  return {
    userId,
    activeId: row.active_id,
    pace: row.pace,
    completed: JSON.parse(row.completed_json),
    bookmarked: JSON.parse(row.bookmarked_json),
    notes: row.notes,
    updatedAt: row.updated_at
  };
}
