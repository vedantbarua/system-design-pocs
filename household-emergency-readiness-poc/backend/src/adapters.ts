import { Kafka, type Consumer, type Producer } from "kafkajs";
import pg from "pg";
import { createClient, type RedisClientType } from "redis";

type Message = { topic: string; key: string; value: Record<string, unknown> };

export class Infrastructure {
  kafkaMode = "memory";
  postgresMode = "memory";
  redisMode = "memory";
  messages: Message[] = [];
  producer: Producer | null = null;
  consumer: Consumer | null = null;
  pool: pg.Pool | null = null;
  redis: RedisClientType | null = null;
  state: Record<string, unknown> | null = null;

  get mode() { return `${this.postgresMode}+${this.redisMode}+${this.kafkaMode}`; }

  async connect() {
    const databaseUrl = process.env.READINESS_DATABASE_URL || "memory://";
    const redisUrl = process.env.READINESS_REDIS_URL || "memory://";
    const brokers = (process.env.READINESS_KAFKA_BROKERS || "memory://").split(",");
    if (databaseUrl !== "memory://") {
      try {
        this.pool = new pg.Pool({ connectionString: databaseUrl });
        await this.pool.query("CREATE TABLE IF NOT EXISTS readiness_snapshots(id TEXT PRIMARY KEY, state JSONB NOT NULL)");
        await this.pool.query("CREATE TABLE IF NOT EXISTS readiness_events(event_key TEXT PRIMARY KEY, payload JSONB NOT NULL)");
        this.postgresMode = "postgres";
      } catch { this.pool = null; }
    }
    if (redisUrl !== "memory://") {
      try { this.redis = createClient({ url: redisUrl }); await this.redis.connect(); this.redisMode = "redis"; } catch { this.redis = null; }
    }
    if (!brokers.includes("memory://")) {
      try {
        const kafka = new Kafka({ clientId: "household-emergency-readiness", brokers });
        this.producer = kafka.producer();
        this.consumer = kafka.consumer({ groupId: "household-emergency-readiness-poc" });
        await this.producer.connect();
        await this.consumer.connect();
        this.kafkaMode = "kafka";
      } catch { this.producer = null; this.consumer = null; }
    }
    return this;
  }

  async publish(topic: string, key: string, value: Record<string, unknown>) { if (this.producer) await this.producer.send({ topic, messages: [{ key, value: JSON.stringify(value) }] }); else this.messages.push({ topic, key, value: structuredClone(value) }); }
  async consume(topic: string, handler: (value: Record<string, unknown>) => Promise<void>) { if (!this.consumer) return; await this.consumer.subscribe({ topic }); await this.consumer.run({ eachMessage: async ({ message }) => { if (message.value) await handler(JSON.parse(message.value.toString())); } }); }
  async drain(topic: string, handler: (value: Record<string, unknown>) => Promise<void>) { let processed = 0; const remaining: Message[] = []; for (const message of this.messages) { if (message.topic === topic) { await handler(message.value); processed += 1; } else remaining.push(message); } this.messages = remaining; return { processed }; }
  async save(state: Record<string, unknown>) { this.state = structuredClone(state); if (this.pool) await this.pool.query("INSERT INTO readiness_snapshots VALUES('demo', $1::jsonb) ON CONFLICT(id) DO UPDATE SET state = EXCLUDED.state", [JSON.stringify(state)]); if (this.redis) await this.redis.set("readiness:snapshot", JSON.stringify(state)); }
  async load() { if (this.pool) { const result = await this.pool.query("SELECT state FROM readiness_snapshots WHERE id = 'demo'"); return result.rows[0]?.state || null; } return this.state; }
  async append(key: string, payload: Record<string, unknown>) { if (this.pool) await this.pool.query("INSERT INTO readiness_events VALUES($1, $2::jsonb) ON CONFLICT DO NOTHING", [key, JSON.stringify(payload)]); }
  async close() { if (this.consumer) await this.consumer.disconnect(); if (this.producer) await this.producer.disconnect(); if (this.redis?.isOpen) await this.redis.quit(); if (this.pool) await this.pool.end(); }
}
