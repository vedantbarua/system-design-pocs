import { Kafka, type Consumer, type Producer } from "kafkajs";
import pg from "pg";
import { createClient, type RedisClientType } from "redis";

type MemoryMessage = {
  topic: string;
  key: string;
  value: Record<string, unknown>;
};

export class Infrastructure {
  mode = "memory";
  kafkaMode = "memory";
  postgresMode = "memory";
  redisMode = "memory";
  messages: MemoryMessage[] = [];
  producer: Producer | null = null;
  consumer: Consumer | null = null;
  pgPool: pg.Pool | null = null;
  redis: RedisClientType | null = null;
  private snapshot: Record<string, unknown> | null = null;

  async connect(): Promise<this> {
    await Promise.all([this.connectPostgres(), this.connectRedis(), this.connectKafka()]);
    this.mode = [this.postgresMode, this.redisMode, this.kafkaMode].join("+");
    return this;
  }

  async connectPostgres(): Promise<void> {
    const databaseUrl = process.env.KNOWLEDGE_DATABASE_URL || "memory://";
    if (databaseUrl === "memory://") return;
    try {
      this.pgPool = new pg.Pool({ connectionString: databaseUrl });
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS knowledge_snapshots (
          id TEXT PRIMARY KEY,
          state JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS knowledge_document_events (
          event_key TEXT PRIMARY KEY,
          topic TEXT NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      this.postgresMode = "postgres";
    } catch (error) {
      console.warn(`PostgreSQL unavailable (${(error as Error).message}); using memory persistence`);
      await this.closePostgres();
    }
  }

  async connectRedis(): Promise<void> {
    const redisUrl = process.env.KNOWLEDGE_REDIS_URL || "memory://";
    if (redisUrl === "memory://") return;
    try {
      this.redis = createClient({ url: redisUrl });
      await this.redis.connect();
      this.redisMode = "redis";
    } catch (error) {
      console.warn(`Redis unavailable (${(error as Error).message}); using memory cache`);
      await this.closeRedis();
    }
  }

  async connectKafka(): Promise<void> {
    const brokers = (process.env.KNOWLEDGE_KAFKA_BROKERS || "memory://").split(",").filter(Boolean);
    if (brokers.includes("memory://")) return;
    try {
      const kafka = new Kafka({ clientId: "personal-knowledge-index", brokers });
      this.producer = kafka.producer();
      this.consumer = kafka.consumer({ groupId: process.env.KNOWLEDGE_KAFKA_GROUP || "personal-knowledge-index-poc" });
      await this.producer.connect();
      await this.consumer.connect();
      this.kafkaMode = "kafka";
    } catch (error) {
      console.warn(`Kafka unavailable (${(error as Error).message}); using memory broker`);
      await this.closeKafka();
    }
  }

  async publish(topic: string, key: string, value: Record<string, unknown>): Promise<void> {
    if (this.producer) {
      await this.producer.send({ topic, messages: [{ key, value: JSON.stringify(value) }] });
      return;
    }
    this.messages.push({ topic, key, value: structuredClone(value) });
  }

  async startConsumer(topic: string, handler: (message: Record<string, unknown>) => Promise<void>): Promise<boolean> {
    if (!this.consumer) return false;
    await this.consumer.subscribe({ topic, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        await handler(JSON.parse(message.value.toString()) as Record<string, unknown>);
      }
    });
    return true;
  }

  async drainMemory(topic: string, handler: (message: Record<string, unknown>) => Promise<void>): Promise<{ processed: number }> {
    let processed = 0;
    const remaining: MemoryMessage[] = [];
    for (const message of this.messages) {
      if (message.topic === topic) {
        await handler(message.value);
        processed += 1;
      } else {
        remaining.push(message);
      }
    }
    this.messages = remaining;
    return { processed };
  }

  async save(state: Record<string, unknown>): Promise<void> {
    this.snapshot = structuredClone(state);
    if (this.pgPool) {
      await this.pgPool.query(
        `
        INSERT INTO knowledge_snapshots (id, state, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
        `,
        ["demo", JSON.stringify(state)]
      );
    }
    if (this.redis) await this.redis.setEx("knowledge:state", 300, JSON.stringify(state));
  }

  async load(): Promise<Record<string, unknown> | null> {
    if (this.pgPool) {
      const result = await this.pgPool.query("SELECT state FROM knowledge_snapshots WHERE id = $1", ["demo"]);
      return result.rows[0]?.state || null;
    }
    return this.snapshot;
  }

  async appendEvent(topic: string, eventKey: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.pgPool) return;
    await this.pgPool.query(
      `
      INSERT INTO knowledge_document_events (event_key, topic, payload)
      VALUES ($1, $2, $3::jsonb)
      ON CONFLICT (event_key) DO NOTHING
      `,
      [eventKey, topic, JSON.stringify(payload)]
    );
  }

  async mirrorJobs(jobs: Array<Record<string, unknown>>): Promise<void> {
    if (!this.redis) return;
    await this.redis.del("knowledge:index-jobs");
    for (const job of jobs) {
      if (job.status === "QUEUED" || job.status === "RETRY") {
        await this.redis.rPush("knowledge:index-jobs", JSON.stringify(job));
      }
    }
  }

  async cacheSearch(key: string, value: unknown): Promise<void> {
    if (this.redis) await this.redis.setEx(`knowledge:query:${key}`, 120, JSON.stringify(value));
  }

  async closeKafka(): Promise<void> {
    if (this.consumer) await this.consumer.disconnect().catch(() => undefined);
    if (this.producer) await this.producer.disconnect().catch(() => undefined);
    this.consumer = null;
    this.producer = null;
    this.kafkaMode = "memory";
  }

  async closeRedis(): Promise<void> {
    if (this.redis?.isOpen) await this.redis.quit().catch(() => undefined);
    this.redis = null;
    this.redisMode = "memory";
  }

  async closePostgres(): Promise<void> {
    if (this.pgPool) await this.pgPool.end().catch(() => undefined);
    this.pgPool = null;
    this.postgresMode = "memory";
  }

  async close(): Promise<void> {
    await Promise.all([this.closeKafka(), this.closeRedis(), this.closePostgres()]);
  }
}
