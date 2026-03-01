/**
 * RunRepository — Durable persistence for healing-agent runs.
 *
 * Replaces the volatile in-memory Map<string, RunRecord>.
 * All status transitions are recorded atomically.
 */
import { query, withTransaction } from "./db.js";
/* ── Mapping helpers ── */
const toRunRecord = (row) => ({
    id: row.id,
    repoUrl: row.repo_url,
    teamName: row.team_name,
    leaderName: row.leader_name,
    retryLimit: row.retry_limit,
    status: row.status,
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt: row.finished_at
        ? new Date(row.finished_at).toISOString()
        : undefined,
    error: row.error ?? undefined,
    // result is assembled by the caller if needed (joins test_results, patches, etc.)
});
/* ── Repository ─────────────────────────────────────────────────────────── */
export const RunRepository = {
    /**
     * Insert a new run in 'queued' status.
     * The worker will transition to 'running' when it picks up the job.
     * Also inserts the initial status transition.
     */
    async create(record) {
        await withTransaction(async (client) => {
            await client.query(`INSERT INTO runs (id, repo_url, team_name, leader_name, retry_limit, status, branch_name)
         VALUES ($1, $2, $3, $4, $5, 'queued', $6)`, [
                record.id,
                record.repoUrl,
                record.teamName,
                record.leaderName,
                record.retryLimit,
                record.branchName,
            ]);
            await client.query(`INSERT INTO status_transitions (run_id, from_status, to_status, reason)
         VALUES ($1, NULL, 'queued', 'Run created — awaiting worker pickup')`, [record.id]);
        });
    },
    /**
     * Fetch a single run by ID. Returns null if not found.
     */
    async findById(runId) {
        const { rows } = await query(`SELECT * FROM runs WHERE id = $1`, [
            runId,
        ]);
        if (rows.length === 0)
            return null;
        return toRunRecord(rows[0]);
    },
    /**
     * Atomically transition run status.
     * Records the transition in status_transitions for auditability.
     */
    async transitionStatus(runId, toStatus, reason, extras) {
        await withTransaction(async (client) => {
            // Fetch current status for the audit trail
            const { rows } = await client.query(`SELECT status FROM runs WHERE id = $1 FOR UPDATE`, [runId]);
            const fromStatus = rows[0]?.status ?? null;
            const sets = ["status = $2"];
            const params = [runId, toStatus];
            let idx = 3;
            if (extras?.error !== undefined) {
                sets.push(`error = $${idx}`);
                params.push(extras.error);
                idx++;
            }
            if (extras?.finishedAt !== undefined) {
                sets.push(`finished_at = $${idx}`);
                params.push(extras.finishedAt);
                idx++;
            }
            await client.query(`UPDATE runs SET ${sets.join(", ")} WHERE id = $1`, params);
            await client.query(`INSERT INTO status_transitions (run_id, from_status, to_status, reason)
         VALUES ($1, $2, $3, $4)`, [runId, fromStatus, toStatus, reason]);
        });
    },
    /**
     * Update counters and analysis after each agent node.
     */
    async updateProgress(runId, data) {
        const sets = [];
        const params = [runId];
        let idx = 2;
        const addField = (column, value) => {
            if (value !== undefined) {
                sets.push(`${column} = $${idx}`);
                params.push(value);
                idx++;
            }
        };
        addField("ci_status", data.ciStatus);
        addField("project_type", data.projectType);
        addField("failures_count", data.failuresCount);
        addField("fixes_count", data.fixesCount);
        addField("commit_count", data.commitCount);
        addField("current_iteration", data.currentIteration);
        addField("branch_name", data.branchName);
        if (data.analysisSummary !== undefined) {
            sets.push(`analysis_summary = $${idx}`);
            params.push(JSON.stringify(data.analysisSummary));
            idx++;
        }
        if (sets.length === 0)
            return;
        await query(`UPDATE runs SET ${sets.join(", ")} WHERE id = $1`, params);
    },
    /**
     * Atomically write final scoring and mark the run completed.
     */
    async finalizeScoring(runId, scoring) {
        await withTransaction(async (client) => {
            const { rows } = await client.query(`SELECT status FROM runs WHERE id = $1 FOR UPDATE`, [runId]);
            const fromStatus = rows[0]?.status ?? null;
            const toStatus = "completed";
            await client.query(`UPDATE runs SET
           base_score = $2,
           speed_bonus = $3,
           efficiency_penalty = $4,
           execution_time_s = $5,
           ci_status = $6,
           failures_count = $7,
           status = $8,
           finished_at = now()
         WHERE id = $1`, [
                runId,
                scoring.baseScore,
                scoring.speedBonus,
                scoring.efficiencyPenalty,
                scoring.executionTimeS,
                scoring.ciStatus,
                scoring.failuresCount,
                toStatus,
            ]);
            await client.query(`INSERT INTO status_transitions (run_id, from_status, to_status, reason)
         VALUES ($1, $2, $3, 'Scoring finalized')`, [runId, fromStatus, toStatus]);
        });
    },
    /**
     * Assemble the full RunResult from joined tables.
     * This is what the API returns.
     */
    async getFullResult(runId) {
        const { rows: runRows } = await query(`SELECT * FROM runs WHERE id = $1`, [runId]);
        if (runRows.length === 0)
            return null;
        const run = runRows[0];
        // Patches → FixRow[]
        const { rows: patchRows } = await query(`SELECT file_path, bug_type, line_number, description, status
       FROM patches WHERE run_id = $1 ORDER BY id`, [runId]);
        // Timeline entries
        const { rows: timelineRows } = await query(`SELECT iteration, result, created_at, retry_count, retry_limit
       FROM timeline_entries WHERE run_id = $1 ORDER BY id`, [runId]);
        // Latest test result
        const { rows: testRows } = await query(`SELECT passed, exit_code, stdout, stderr, duration_ms,
              failed_tests, error_summary, execution_method
       FROM test_results WHERE run_id = $1
       ORDER BY id DESC LIMIT 1`, [runId]);
        const testResult = testRows[0] ?? {
            passed: false,
            exit_code: -1,
            stdout: "",
            stderr: "",
            duration_ms: 0,
            failed_tests: [],
            error_summary: "",
            execution_method: "skipped",
        };
        return {
            executionTime: run.execution_time_s,
            ciStatus: run.ci_status,
            failuresCount: run.failures_count,
            fixesCount: run.fixes_count,
            commitCount: run.commit_count,
            fixesTable: patchRows.map((p) => ({
                filePath: p.file_path,
                bugType: p.bug_type,
                lineNumber: p.line_number,
                commitMessage: p.description,
                status: p.status,
            })),
            timeline: timelineRows.map((t) => ({
                iteration: t.iteration,
                result: t.result,
                timestamp: new Date(t.created_at).toISOString(),
                retryCount: t.retry_count,
                retryLimit: t.retry_limit,
            })),
            baseScore: run.base_score,
            speedBonus: run.speed_bonus,
            efficiencyPenalty: run.efficiency_penalty,
            repoUrl: run.repo_url,
            generatedBranchName: run.branch_name,
            analysisSummary: run.analysis_summary,
            testResults: {
                passed: testResult.passed,
                exitCode: testResult.exit_code,
                stdout: testResult.stdout,
                stderr: testResult.stderr,
                durationMs: testResult.duration_ms,
                failedTests: Array.isArray(testResult.failed_tests)
                    ? testResult.failed_tests
                    : [],
                errorSummary: testResult.error_summary,
                executionMethod: testResult.execution_method,
            },
            projectType: run.project_type,
        };
    },
    /**
     * List recent runs, most recent first.
     */
    async listRecent(limit = 50) {
        const { rows } = await query(`SELECT * FROM runs ORDER BY created_at DESC LIMIT $1`, [limit]);
        return rows.map(toRunRecord);
    },
};
//# sourceMappingURL=RunRepository.js.map