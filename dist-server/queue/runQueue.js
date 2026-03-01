/**
 * runQueue.ts — BullMQ queue definition for remediation jobs.
 *
 * This module owns the Queue instance. It is imported by:
 *   - server.ts  →  to enqueue jobs from the HTTP POST handler
 *   - worker.ts  →  indirectly (worker creates its own connection)
 *
 * Queue configuration:
 *   - 3 automatic retries with exponential backoff
 *   - Completed and failed jobs are retained (not auto-purged)
 *   - Jobs carry only serializable identifiers — no large payloads
 */
import { Queue } from "bullmq";
import { createRedisConnection } from "./redis.js";
/** Unique queue name — must match between Queue and Worker. */
export const REMEDIATION_QUEUE_NAME = "remediation-runs";
export const remediationQueue = new Queue(REMEDIATION_QUEUE_NAME, {
    connection: createRedisConnection(),
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 5_000, // 5 s → 10 s → 20 s
        },
        removeOnComplete: false,
        removeOnFail: false,
    },
});
console.log(`[queue] Remediation queue "${REMEDIATION_QUEUE_NAME}" initialized`);
/**
 * Enqueue a remediation run.
 *
 * Returns the BullMQ Job so the caller can log the internal job ID
 * if needed, but the primary identifier is always `runId`.
 */
export const enqueueRun = async (data) => {
    const job = await remediationQueue.add("remediate", data, {
        jobId: data.runId, // Deduplicate by runId — prevents double-enqueue
    });
    console.log(`[queue] Enqueued run ${data.runId} (jobId=${job.id})`);
    return job;
};
//# sourceMappingURL=runQueue.js.map