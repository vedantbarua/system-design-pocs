import pg from "pg";
import { createClient } from "redis";

const { Pool } = pg;
const SNAPSHOT_ID = "returns-refunds-demo";

export class MemoryRepository {
  constructor() {
    this.state = null;
    this.claims = new Set();
    this.mode = "memory";
  }

  async load() {
    return this.state ? structuredClone(this.state) : null;
  }

  async save(state) {
    this.state = structuredClone(state);
  }

  async claim(key) {
    if (this.claims.has(key)) return false;
    this.claims.add(key);
    return true;
  }

  async appendOperationalEvent() {}
  async close() {}
}

export class PostgresRedisRepository {
  constructor(databaseUrl, redisUrl) {
    this.pool = new Pool({ connectionString: databaseUrl });
    this.redis = createClient({ url: redisUrl });
    this.mode = "postgres+redis";
  }

  async connect() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS returns_refunds_snapshots (
        id TEXT PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS returns_refunds_event_log (
        id BIGSERIAL PRIMARY KEY,
        event_key TEXT NOT NULL UNIQUE,
        return_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await this.redis.connect();
  }

  async load() {
    const result = await this.pool.query("SELECT state FROM returns_refunds_snapshots WHERE id = $1", [SNAPSHOT_ID]);
    return result.rows[0]?.state || null;
  }

  async save(state) {
    await this.pool.query(
      `INSERT INTO returns_refunds_snapshots (id, state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
      [SNAPSHOT_ID, JSON.stringify(state)]
    );
    await this.redis.set("returns-refunds:snapshot", JSON.stringify(state), { EX: 300 });
  }

  async claim(key) {
    const result = await this.redis.set(`returns-refunds:dedupe:${key}`, "1", { NX: true, EX: 7 * 24 * 60 * 60 });
    return result === "OK";
  }

  async appendOperationalEvent(event) {
    await this.pool.query(
      `INSERT INTO returns_refunds_event_log (event_key, return_id, event_type, payload)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (event_key) DO NOTHING`,
      [event.eventKey, event.returnId, event.type, JSON.stringify(event)]
    );
    await this.redis.xAdd(
      "returns-refunds:events",
      "*",
      { returnId: event.returnId, type: event.type, applied: String(event.applied) },
      { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 1000 } }
    );
  }

  async close() {
    if (this.redis.isOpen) await this.redis.quit();
    await this.pool.end();
  }
}

export async function createRepository() {
  const databaseUrl = process.env.RETURNS_DATABASE_URL || "memory://";
  const redisUrl = process.env.RETURNS_REDIS_URL || "memory://";
  if (databaseUrl === "memory://" || redisUrl === "memory://") return new MemoryRepository();
  const repository = new PostgresRedisRepository(databaseUrl, redisUrl);
  try {
    await repository.connect();
    return repository;
  } catch (error) {
    console.warn(`PostgreSQL/Redis unavailable (${error.message}); using in-memory repository`);
    await repository.close().catch(() => {});
    return new MemoryRepository();
  }
}
