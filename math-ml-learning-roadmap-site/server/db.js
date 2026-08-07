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
