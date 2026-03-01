/**
 * TestResultRepository — Persist real test / build execution results.
 *
 * Each test execution (baseline and per-iteration verification) is stored
 * as its own row, giving a full audit trail of every test run.
 */
import { query } from "./db.js";
export const TestResultRepository = {
    /**
     * Insert a test-execution result tied to a specific run and iteration.
     *
     * @param phase  'baseline' for the initial analyzer run,
     *               'verification' for post-patch verifier runs.
     */
    async create(runId, iteration, phase, result) {
        await query(`INSERT INTO test_results
         (run_id, iteration, phase, passed, exit_code, stdout, stderr,
          duration_ms, failed_tests, error_summary, execution_method)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
            runId,
            iteration,
            phase,
            result.passed,
            result.exitCode,
            result.stdout,
            result.stderr,
            result.durationMs,
            JSON.stringify(result.failedTests),
            result.errorSummary,
            result.executionMethod,
        ]);
    },
    /**
     * Fetch all test results for a run, ordered by iteration.
     */
    async findByRunId(runId) {
        const { rows } = await query(`SELECT iteration, phase, passed, exit_code, stdout, stderr,
              duration_ms, failed_tests, error_summary, execution_method
       FROM test_results WHERE run_id = $1 ORDER BY id`, [runId]);
        return rows.map((r) => ({
            iteration: r.iteration,
            phase: r.phase,
            result: {
                passed: r.passed,
                exitCode: r.exit_code,
                stdout: r.stdout,
                stderr: r.stderr,
                durationMs: r.duration_ms,
                failedTests: Array.isArray(r.failed_tests) ? r.failed_tests : [],
                errorSummary: r.error_summary,
                executionMethod: r.execution_method,
            },
        }));
    },
    /**
     * Fetch the latest test result for a run.
     */
    async findLatest(runId) {
        const { rows } = await query(`SELECT passed, exit_code, stdout, stderr, duration_ms,
              failed_tests, error_summary, execution_method
       FROM test_results WHERE run_id = $1 ORDER BY id DESC LIMIT 1`, [runId]);
        if (rows.length === 0)
            return null;
        const r = rows[0];
        return {
            passed: r.passed,
            exitCode: r.exit_code,
            stdout: r.stdout,
            stderr: r.stderr,
            durationMs: r.duration_ms,
            failedTests: Array.isArray(r.failed_tests) ? r.failed_tests : [],
            errorSummary: r.error_summary,
            executionMethod: r.execution_method,
        };
    },
};
//# sourceMappingURL=TestResultRepository.js.map