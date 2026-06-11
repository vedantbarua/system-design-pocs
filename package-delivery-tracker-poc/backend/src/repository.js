import { createClient } from "redis";

const SNAPSHOT_KEY = "package-tracker:snapshot";
const STREAM_KEY = "package-tracker:events";
const DEDUPE_PREFIX = "package-tracker:dedupe:";

export class MemoryRepository {
  constructor() {
    this.snapshot = null;
    this.claims = new Set();
    this.stream = [];
    this.mode = "memory";
  }

  async load() {
    return this.snapshot;
  }

  async save(state) {
    this.snapshot = structuredClone(state);
  }

  async claimEvent(key) {
    if (this.claims.has(key)) return false;
    this.claims.add(key);
    return true;
  }

  async appendEvent(event) {
    this.stream.push(structuredClone(event));
  }

  async close() {}
}

export class RedisRepository {
  constructor(url) {
    this.client = createClient({ url });
    this.mode = "redis";
  }

  async connect() {
    await this.client.connect();
  }

  async load() {
    const value = await this.client.get(SNAPSHOT_KEY);
    return value ? JSON.parse(value) : null;
  }

  async save(state) {
    await this.client.set(SNAPSHOT_KEY, JSON.stringify(state));
  }

  async claimEvent(key) {
    const result = await this.client.set(`${DEDUPE_PREFIX}${key}`, "1", { NX: true, EX: 7 * 24 * 60 * 60 });
    return result === "OK";
  }

  async appendEvent(event) {
    await this.client.xAdd(
      STREAM_KEY,
      "*",
      {
        packageId: event.packageId,
        carrier: event.carrier,
        status: event.normalizedStatus,
        occurredAt: event.occurredAt,
        projectionApplied: String(event.projectionApplied)
      },
      { TRIM: { strategy: "MAXLEN", strategyModifier: "~", threshold: 1000 } }
    );
    await this.client.publish("package-tracker:updates", JSON.stringify(event));
  }

  async close() {
    if (this.client.isOpen) await this.client.quit();
  }
}

export async function createRepository(url = process.env.PACKAGE_TRACKER_REDIS_URL || "memory://") {
  if (url === "memory://") return new MemoryRepository();
  const repository = new RedisRepository(url);
  try {
    await repository.connect();
    return repository;
  } catch (error) {
    console.warn(`Redis unavailable (${error.message}); using in-memory repository`);
    await repository.close().catch(() => {});
    return new MemoryRepository();
  }
}
