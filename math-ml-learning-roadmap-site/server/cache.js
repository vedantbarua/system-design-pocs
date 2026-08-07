const memory = new Map();

export async function createCache() {
  if (!process.env.REDIS_URL) {
    return memoryCache("memory");
  }

  try {
    const { createClient } = await import("redis");
    const client = createClient({ url: process.env.REDIS_URL });
    client.on("error", () => {});
    await client.connect();
    return {
      mode: "redis",
      async get(key) {
        return client.get(key);
      },
      async set(key, value, ttlSeconds = 3600) {
        await client.set(key, value, { EX: ttlSeconds });
      },
      async incr(key) {
        return client.incr(key);
      },
      async close() {
        await client.quit();
      }
    };
  } catch {
    return memoryCache("memory-fallback");
  }
}

function memoryCache(mode) {
  return {
    mode,
    async get(key) {
      const entry = memory.get(key);
      if (!entry) return null;
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        memory.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds = 3600) {
      memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    },
    async incr(key) {
      const current = Number((await this.get(key)) || 0) + 1;
      await this.set(key, String(current));
      return current;
    },
    async close() {}
  };
}
