/**
 * PatchRepository — Persist individual patch / fix records and timeline entries.
 *
 * Each patch (file mutation) applied during remediation is recorded here,
 * along with the per-iteration timeline that the dashboard renders.
 */
import { query, withTransaction } from "./db.js";
export const PatchRepository = {
    /**
     * Bulk-insert patches for a single remediation iteration.
     * Also inserts the corresponding timeline entry atomically.
     */
    async recordIteration(runId, iteration, patches, timelineEntry, commitSha) {
        await withTransaction(async (client) => {
            // Insert patches
            for (const p of patches) {
                await client.query(`INSERT INTO patches
             (run_id, iteration, file_path, bug_type, line_number, description, status, commit_sha)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`, [
                    runId,
                    iteration,
                    p.filePath,
                    p.bugType,
                    p.lineNumber,
                    p.commitMessage,
                    p.status,
                    commitSha ?? null,
                ]);
            }
            // Insert timeline entry
            await client.query(`INSERT INTO timeline_entries
           (run_id, iteration, result, retry_count, retry_limit)
         VALUES ($1, $2, $3, $4, $5)`, [
                runId,
                timelineEntry.iteration,
                timelineEntry.result,
                timelineEntry.retryCount,
                timelineEntry.retryLimit,
            ]);
        });
    },
    /**
     * Fetch all patches for a run.
     */
    async findByRunId(runId) {
        const { rows } = await query(`SELECT file_path, bug_type, line_number, description, status
       FROM patches WHERE run_id = $1 ORDER BY id`, [runId]);
        return rows.map((r) => ({
            filePath: r.file_path,
            bugType: r.bug_type,
            lineNumber: r.line_number,
            commitMessage: r.description,
            status: r.status,
        }));
    },
    /**
     * Fetch all timeline entries for a run.
     */
    async findTimelineByRunId(runId) {
        const { rows } = await query(`SELECT iteration, result, created_at, retry_count, retry_limit
       FROM timeline_entries WHERE run_id = $1 ORDER BY id`, [runId]);
        return rows.map((r) => ({
            iteration: r.iteration,
            result: r.result,
            timestamp: new Date(r.created_at).toISOString(),
            retryCount: r.retry_count,
            retryLimit: r.retry_limit,
        }));
    },
};
//# sourceMappingURL=PatchRepository.js.map