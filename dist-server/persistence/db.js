/**
 * db.ts — MongoDB connection manager (Mongoose).
 *
 * Production-grade features:
 *  • Atlas-tuned connection options
 *  • Automatic reconnection listeners
 *  • Exponential back-off retry utility (withRetry)
 *  • Structured logging helper (dbLog)
 *  • Health-check ping
 */
import mongoose from 'mongoose';
/* ── Internal state ── */
let poolReady = false;
export const dbLog = (entry) => {
    const parts = [
        `[db]`,
        `[${entry.level.toUpperCase()}]`,
        `op=${entry.operation}`,
        entry.message,
    ];
    if (entry.durationMs !== undefined)
        parts.push(`duration=${entry.durationMs}ms`);
    if (entry.error)
        parts.push(`error="${entry.error}"`);
    const line = parts.join(' ');
    if (entry.level === 'error')
        console.error(line);
    else if (entry.level === 'warn')
        console.warn(line);
    else
        console.log(line);
};
/* ── Retry utility ── */
const RETRIABLE_CODES = new Set([
    'ETIMEDOUT',
    'ECONNRESET',
    'ECONNREFUSED',
    'MongoNetworkError',
    'MongoServerSelectionError',
]);
const isRetriable = (err) => {
    if (!(err instanceof Error))
        return false;
    const name = err.name ?? '';
    const code = err.code ?? '';
    return (RETRIABLE_CODES.has(name) ||
        RETRIABLE_CODES.has(code) ||
        err.message.toLowerCase().includes('topology') ||
        err.message.toLowerCase().includes('timed out'));
};
/**
 * Retry a DB operation up to `maxAttempts` times with exponential back-off.
 * Only retries on network-level / transient errors.
 */
export const withRetry = async (operation, fn, maxAttempts = 3) => {
    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            lastErr = err;
            if (!isRetriable(err) || attempt === maxAttempts)
                throw err;
            const delay = Math.min(200 * Math.pow(2, attempt - 1), 3000); // 200 ms → 400 → 800 → clamp 3 s
            dbLog({
                level: 'warn',
                operation,
                message: `Transient error on attempt ${attempt}/${maxAttempts}, retrying in ${delay}ms`,
                error: err instanceof Error ? err.message : String(err),
            });
            await new Promise((r) => setTimeout(r, delay));
        }
    }
    throw lastErr;
};
/* ── Connection lifecycle ── */
export const initPool = async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set. Provide a MongoDB Atlas connection string in your .env file.');
    }
    try {
        const url = new URL(connectionString);
        dbLog({ level: 'info', operation: 'init', message: `Connecting to host=${url.hostname} db=${url.pathname.replace('/', '')} user=${url.username}` });
    }
    catch {
        // URI not parseable — log anyway
        dbLog({ level: 'info', operation: 'init', message: 'Connecting to MongoDB…' });
    }
    /* Wire up connection events before calling connect() */
    mongoose.connection.on('connected', () => {
        poolReady = true;
        dbLog({ level: 'info', operation: 'lifecycle', message: '✓ Connected' });
    });
    mongoose.connection.on('reconnected', () => {
        poolReady = true;
        dbLog({ level: 'info', operation: 'lifecycle', message: '↺ Reconnected' });
    });
    mongoose.connection.on('disconnected', () => {
        poolReady = false;
        dbLog({ level: 'warn', operation: 'lifecycle', message: '⚡ Disconnected from MongoDB' });
    });
    mongoose.connection.on('error', (err) => {
        dbLog({ level: 'error', operation: 'lifecycle', message: 'Connection error', error: err.message });
    });
    try {
        await mongoose.connect(connectionString, {
            // Pool sizing
            minPoolSize: 2,
            maxPoolSize: 10,
            // Timeouts tuned for Atlas (TLS handshake + network latency)
            serverSelectionTimeoutMS: 15_000,
            connectTimeoutMS: 15_000,
            socketTimeoutMS: 45_000,
            // Allow Atlas rolling restarts without hard-crash
            heartbeatFrequencyMS: 10_000,
        });
        poolReady = true;
        dbLog({ level: 'info', operation: 'init', message: '✓ Connection pool ready' });
    }
    catch (err) {
        dbLog({
            level: 'error',
            operation: 'init',
            message: '✗ Connection FAILED',
            error: err instanceof Error ? err.message : String(err),
        });
        throw err;
    }
};
export const isPoolReady = () => poolReady && mongoose.connection.readyState === 1;
/** Quick round-trip ping — used by the health-check route. */
export const pingDB = async () => {
    const t0 = Date.now();
    try {
        await mongoose.connection.db.command({ ping: 1 });
        return { ok: true, latencyMs: Date.now() - t0 };
    }
    catch {
        return { ok: false, latencyMs: Date.now() - t0 };
    }
};
export const closePool = async () => {
    dbLog({ level: 'info', operation: 'shutdown', message: 'Closing MongoDB connection pool…' });
    await mongoose.disconnect();
    dbLog({ level: 'info', operation: 'shutdown', message: 'Pool closed' });
};
/* ── Transaction helper ── */
/**
 * Execute a callback inside a MongoDB multi-document transaction.
 * Atlas replica sets support transactions natively.
 * Sessions are always cleaned up in the `finally` block.
 */
export const withTransaction = async (fn) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();
        const result = await fn(session);
        await session.commitTransaction();
        return result;
    }
    catch (err) {
        await session.abortTransaction();
        throw err;
    }
    finally {
        session.endSession();
    }
};
//# sourceMappingURL=db.js.map