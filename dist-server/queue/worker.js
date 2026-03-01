/**
 * worker.ts — BullMQ Worker that executes remediation jobs.
 *
 * This module is imported by server.ts at startup. It is logically
 * independent from Express — it does not use HTTP request/response
 * objects, sessions, or middleware. It operates purely on:
 *   - Job data (runId + repo coordinates)
 *   - Postgres persistence layer
 *   - Filesystem + subprocess execution
 *
 * Lifecycle per job:
 *   1. Transition run status → "running"
 *   2. Execute the full LangGraph agent pipeline
 *   3. Persist final results (JSON files + Postgres)
 *   4. Transition run status → "completed" or "failed"
 *
 * Concurrency is set to 2 so a single Render web service can process
 * multiple jobs in parallel without overloading the container.
 */
import { Worker } from "bullmq";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRedisConnection } from "./redis.js";
import { REMEDIATION_QUEUE_NAME, } from "./runQueue.js";
import { runAgentGraph } from "../agents/graphAgents.js";
import { generateBranchName } from "../services/branch.js";
import { RunRepository } from "../persistence/index.js";
/* ── Path setup (mirrors server.ts) ── */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "../..");
const runsRoot = path.join(workspaceRoot, "runs");
const publicResultsPath = path.join(workspaceRoot, "public", "results.json");
/* ── Helpers ── */
const persistRunResult = async (runId, result) => {
    const runDir = path.join(runsRoot, runId);
    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, "results.json"), JSON.stringify(result, null, 2), "utf8");
    await writeFile(publicResultsPath, JSON.stringify(result, null, 2), "utf8");
};
const buildFallbackResult = (data, errorMsg) => ({
    executionTime: 0,
    ciStatus: "failed",
    failuresCount: 1,
    fixesCount: 0,
    commitCount: 0,
    fixesTable: [],
    timeline: [
        {
            iteration: 1,
            result: "failed",
            timestamp: new Date().toISOString(),
            retryCount: 1,
            retryLimit: data.retryLimit,
        },
    ],
    baseScore: 0,
    speedBonus: 0,
    efficiencyPenalty: 0,
    repoUrl: data.repoUrl,
    generatedBranchName: generateBranchName(data.teamName, data.leaderName),
    analysisSummary: {
        totalFiles: 0,
        dominantLanguage: "Unknown",
        samplePaths: [],
        detectedIssues: [],
    },
    testResults: {
        passed: false,
        exitCode: -1,
        stdout: "",
        stderr: errorMsg,
        durationMs: 0,
        failedTests: [],
        errorSummary: errorMsg,
        executionMethod: "skipped",
    },
    projectType: "unknown",
});
/* ── Job processor ── */
const processRemediationJob = async (job) => {
    const { runId, repoUrl, teamName, leaderName, retryLimit } = job.data;
    console.log(`[worker] ▸ Processing job ${job.id} — run=${runId} repo=${repoUrl}`);
    // 1. Transition: queued → running
    await RunRepository.transitionStatus(runId, "running", "Worker picked up job");
    try {
        // 2. Execute the full remediation pipeline
        const result = await runAgentGraph({
            runId,
            repoUrl,
            teamName,
            leaderName,
            retryLimit,
        });
        // 3. Persist JSON artifacts (backward compat with dashboard)
        await persistRunResult(runId, result);
        console.log(`[worker] ✓ Run ${runId} completed — ci=${result.ciStatus}, ` +
            `fixes=${result.fixesCount}, commits=${result.commitCount}`);
    }
    catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown worker error";
        console.error(`[worker] ✗ Run ${runId} failed: ${errorMsg}`);
        // Persist failure state so the API can report it
        await RunRepository.transitionStatus(runId, "failed", errorMsg, {
            error: errorMsg,
            finishedAt: new Date().toISOString(),
        });
        await persistRunResult(runId, buildFallbackResult(job.data, errorMsg));
        // Re-throw so BullMQ records the failure and can retry if attempts remain
        throw error;
    }
};
/* ── Worker instance ── */
export const remediationWorker = new Worker(REMEDIATION_QUEUE_NAME, processRemediationJob, {
    connection: createRedisConnection(),
    concurrency: 2,
    // Prevent stalled-job detection from being too aggressive on long runs
    lockDuration: 600_000, // 10 minutes
    stalledInterval: 300_000, // Check every 5 minutes
});
/* ── Worker lifecycle logging ── */
remediationWorker.on("completed", (job) => {
    console.log(`[worker] Job ${job.id} completed successfully`);
});
remediationWorker.on("failed", (job, err) => {
    console.error(`[worker] Job ${job?.id ?? "unknown"} failed (attempt ${job?.attemptsMade ?? "?"}/${job?.opts?.attempts ?? "?"}): ${err.message}`);
});
remediationWorker.on("error", (err) => {
    console.error("[worker] Worker error:", err.message);
});
remediationWorker.on("stalled", (jobId) => {
    console.warn(`[worker] Job ${jobId} stalled — will be retried`);
});
console.log(`[worker] Remediation worker started — queue="${REMEDIATION_QUEUE_NAME}", concurrency=2`);
//# sourceMappingURL=worker.js.map