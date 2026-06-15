import { Kafka, type Consumer, type Producer } from "kafkajs";
import pg from "pg";
import { createClient, type RedisClientType } from "redis";
import type { Reading } from "./core.js";

type KafkaMessage = {
  key: string;
  value: Record<string, unknown>;
};

export class Infrastructure {
  mode = "memory";
  kafkaMode = "memory";
  postgresMode = "memory";
  redisMode = "memory";
  messages: KafkaMessage[] = [];
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
    const databaseUrl = process.env.UTILITY_DATABASE_URL || "memory://";
    if (databaseUrl === "memory://") return;
    try {
      this.pgPool = new pg.Pool({ connectionString: databaseUrl });
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS utility_monitor_snapshots (
          id TEXT PRIMARY KEY,
          state JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await this.pgPool.query(`
        CREATE TABLE IF NOT EXISTS utility_meter_readings (
          event_key TEXT PRIMARY KEY,
          meter_id TEXT NOT NULL,
          measured_at TIMESTAMPTZ NOT NULL,
          value DOUBLE PRECISION NOT NULL,
          payload JSONB NOT NULL
        )
      `);
      await this.pgPool.query(`CREATE INDEX IF NOT EXISTS utility_meter_readings_meter_time ON utility_meter_readings (meter_id, measured_at)`);
      try {
        await this.pgPool.query("CREATE EXTENSION IF NOT EXISTS timescaledb");
        await this.pgPool.query("SELECT create_hypertable('utility_meter_readings', 'measured_at', if_not_exists => TRUE)");
        this.postgresMode = "postgres+timescale";
      } catch {
        this.postgresMode = "postgres";
      }
    } catch (error) {
      console.warn(`PostgreSQL unavailable (${(error as Error).message}); using memory persistence`);
      await this.closePostgres();
    }
  }

  async connectRedis(): Promise<void> {
    const redisUrl = process.env.UTILITY_REDIS_URL || "memory://";
    if (redisUrl === "memory://") return;
    try {
      this.redis = createClient({ url: redisUrl });
      await this.redis.connect();
      this.redisMode = "redis";
    } catch (error) {
      console.warn(`Redis unavailable (${(error as Error).message}); using memory alert state`);
      await this.closeRedis();
    }
  }

  async connectKafka(): Promise<void> {
    const brokers = (process.env.UTILITY_KAFKA_BROKERS || "memory://").split(",").filter(Boolean);
    if (brokers.includes("memory://")) return;
    try {
      const kafka = new Kafka({ clientId: "home-utility-monitor", brokers });
      this.producer = kafka.producer();
      this.consumer = kafka.consumer({ groupId: process.env.UTILITY_KAFKA_GROUP || "utility-monitor-poc" });
      await this.producer.connect();
      await this.consumer.connect();
      this.kafkaMode = "kafka";
    } catch (error) {
      console.warn(`Kafka unavailable (${(error as Error).message}); using memory broker`);
      await this.closeKafka();
    }
  }

  async publishReading(topic: string, key: string, value: Record<string, unknown>): Promise<void> {
    if (this.producer) {
      await this.producer.send({ topic, messages: [{ key, value: JSON.stringify(value) }] });
      return;
    }
    this.messages.push({ key, value: structuredClone(value) });
  }

  async startKafkaConsumer(topic: string, handler: (message: Record<string, unknown>) => Promise<void>): Promise<boolean> {
    if (!this.consumer) return false;
    await this.consumer.subscribe({ topic, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ message }) => {
        if (!message.value) return;
        const payload = JSON.parse(message.value.toString()) as Record<string, unknown>;
        await handler(payload);
      }
    });
    return true;
  }

  async consumeMemoryMessages(handler: (message: Record<string, unknown>) => Promise<void>): Promise<{ processed: number }> {
    let processed = 0;
    while (this.messages.length) {
      const message = this.messages.shift();
      if (!message) break;
      await handler(message.value);
      processed += 1;
    }
    return { processed };
  }

  async save(state: Record<string, unknown>): Promise<void> {
    this.snapshot = structuredClone(state);
    if (this.pgPool) {
      await this.pgPool.query(
        `
        INSERT INTO utility_monitor_snapshots (id, state, updated_at)
        VALUES ($1, $2::jsonb, NOW())
        ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
        `,
        ["demo", JSON.stringify(state)]
      );
    }
    if (this.redis) await this.redis.setEx("utility-monitor:snapshot", 300, JSON.stringify(state));
  }

  async load(): Promise<Record<string, unknown> | null> {
    if (this.pgPool) {
      const result = await this.pgPool.query("SELECT state FROM utility_monitor_snapshots WHERE id = $1", ["demo"]);
      return result.rows[0]?.state || null;
    }
    return this.snapshot;
  }

  async appendReading(reading: Reading): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.query(
        `
        INSERT INTO utility_meter_readings (event_key, meter_id, measured_at, value, payload)
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (event_key) DO NOTHING
        `,
        [reading.eventKey, reading.meterId, reading.measuredAt, reading.value, JSON.stringify(reading)]
      );
    }
  }

  async mirrorJobs(jobs: Array<Record<string, unknown>>): Promise<void> {
    if (!this.redis) return;
    await this.redis.del("utility-monitor:jobs");
    for (const job of jobs) {
      if (job.status === "READY" || job.status === "RETRY") {
        await this.redis.rPush("utility-monitor:jobs", JSON.stringify(job));
      }
    }
  }

  async closePostgres(): Promise<void> {
    if (this.pgPool) await this.pgPool.end().catch(() => undefined);
    this.pgPool = null;
    this.postgresMode = "memory";
  }

  async closeRedis(): Promise<void> {
    if (this.redis?.isOpen) await this.redis.quit().catch(() => undefined);
    this.redis = null;
    this.redisMode = "memory";
  }

  async closeKafka(): Promise<void> {
    if (this.consumer) await this.consumer.disconnect().catch(() => undefined);
    if (this.producer) await this.producer.disconnect().catch(() => undefined);
    this.consumer = null;
    this.producer = null;
    this.kafkaMode = "memory";
  }

  async close(): Promise<void> {
    await Promise.all([this.closeKafka(), this.closeRedis(), this.closePostgres()]);
  }
}
