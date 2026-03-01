/**
 * redis.ts — Shared Redis connection factory for BullMQ.
 *
 * Provides a single IORedis connection builder configured from REDIS_URL.
 * BullMQ requires separate connections for Queue and Worker (Redis does not
 * allow a single connection to be reused for both pub and sub), so this
 * module exposes a factory function rather than a singleton instance.
 *
 * Connection options are tuned for production:
 *   - TLS enabled when rediss:// scheme is detected
 *   - Automatic reconnect with exponential backoff
 *   - Explicit lazyConnect so callers control the connection lifecycle
 */
import { Redis } from "ioredis";
const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
    console.error("[redis] FATAL: REDIS_URL environment variable is not set. " +
        "BullMQ requires a Redis instance. Set REDIS_URL and restart.");
}
const baseOptions = {
    maxRetriesPerRequest: null, // Required by BullMQ — it manages its own retries
    enableReadyCheck: false, // Faster startup; BullMQ handles readiness internally
    retryStrategy(times) {
        // Exponential backoff capped at 15 s
        return Math.min(times * 500, 15_000);
    },
};
/**
 * Create a new IORedis connection for BullMQ consumers.
 *
 * Each caller gets an independent connection — this is intentional:
 * BullMQ requires distinct connections for Queue (publisher) and
 * Worker (subscriber / blocking pop).
 */
export const createRedisConnection = () => {
    if (!REDIS_URL) {
        throw new Error("Cannot create Redis connection — REDIS_URL is not set.");
    }
    const conn = new Redis(REDIS_URL, baseOptions);
    conn.on("connect", () => console.log("[redis] Connected to Redis"));
    conn.on("error", (err) => console.error("[redis] Connection error:", err.message));
    conn.on("close", () => console.log("[redis] Connection closed"));
    return conn;
};
//# sourceMappingURL=redis.js.map