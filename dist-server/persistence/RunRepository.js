/**
 * RunRepository — Durable persistence for healing-agent runs using Mongoose.
 *
 * Key optimizations vs. the initial migration:
 *  • create()          — removed unnecessary transaction; sequential inserts + error guard
 *  • getFullResult()   — single aggregation pipeline replaces 4 parallel queries (N+1 fix)
 *  • updateProgress()  — uses atomic $set with new: true, no fetch needed
 *  • transitionStatus()/finalizeScoring() — transactions kept (genuine multi-doc atomicity)
 *  • All operations    — wrapped with withRetry() for transient-failure resilience
 *  • All operations    — structured timing logs via dbLog()
 */
import { withTransaction, withRetry, dbLog } from './db.js';
import { Run } from './models/Run.js';
import { StatusTransition } from './models/StatusTransition.js';
/* ── Lean mapper ── */
const toRunRecord = (row) => ({
    id: String(row._id),
    repoUrl: row.repoUrl,
    teamName: row.teamName,
    leaderName: row.leaderName,
    retryLimit: row.retryLimit,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString(),
    error: row.error,
});
/* ── Repository ── */
export const RunRepository = {
    /** Count runs currently in 'running' state — used by health endpoint. */
    async countActiveRuns() {
        return withRetry('countActiveRuns', () => Run.countDocuments({ status: 'running' }));
    },
    /**
     * Persist a new run in 'queued' state.
     * No transaction needed: StatusTransition is an audit log; a missed row is not fatal.
     */
    async create(record) {
        const t0 = Date.now();
        await withRetry('RunRepository.create', async () => {
            await Run.create([{
                    _id: record.id,
                    repoUrl: record.repoUrl,
                    teamName: record.teamName,
                    leaderName: record.leaderName,
                    retryLimit: record.retryLimit,
                    branchName: record.branchName,
                    status: 'queued',
                }]);
            // Best-effort audit trail — failure here does not roll back the run
            await StatusTransition.create([{
                    runId: record.id,
                    fromStatus: null,
                    toStatus: 'queued',
                    reason: 'Run created — awaiting worker pickup',
                }]).catch((auditErr) => {
                dbLog({ level: 'warn', operation: 'RunRepository.create', message: `Status transition write failed (non-fatal): ${auditErr.message}` });
            });
        });
        dbLog({ level: 'info', operation: 'RunRepository.create', message: `Run ${record.id} created`, durationMs: Date.now() - t0 });
    },
    /** Fetch a single run header (no sub-collection data). */
    async findById(runId) {
        return withRetry('RunRepository.findById', async () => {
            const run = await Run.findById(runId).lean();
            return run ? toRunRecord(run) : null;
        });
    },
    /**
     * Atomically transition run status and append an audit entry.
     * Uses a transaction because both documents must succeed together.
     */
    async transitionStatus(runId, toStatus, reason, extras) {
        const t0 = Date.now();
        await withRetry('RunRepository.transitionStatus', () => withTransaction(async (session) => {
            const run = await Run.findById(runId).session(session);
            if (!run)
                return;
            const fromStatus = run.status;
            run.status = toStatus;
            if (extras?.error !== undefined)
                run.error = extras.error;
            if (extras?.finishedAt !== undefined)
                run.finishedAt = new Date(extras.finishedAt);
            await run.save({ session });
            await StatusTransition.create([{ runId, fromStatus, toStatus, reason }], { session });
        }));
        dbLog({ level: 'info', operation: 'RunRepository.transitionStatus', message: `Run ${runId} → ${toStatus}`, durationMs: Date.now() - t0 });
    },
    /** Partial update of mutable counters/fields — atomic $set, no fetch. */
    async updateProgress(runId, data) {
        const set = {};
        if (data.ciStatus !== undefined)
            set.ciStatus = data.ciStatus;
        if (data.projectType !== undefined)
            set.projectType = data.projectType;
        if (data.failuresCount !== undefined)
            set.failuresCount = data.failuresCount;
        if (data.fixesCount !== undefined)
            set.fixesCount = data.fixesCount;
        if (data.commitCount !== undefined)
            set.commitCount = data.commitCount;
        if (data.currentIteration !== undefined)
            set.currentIteration = data.currentIteration;
        if (data.branchName !== undefined)
            set.branchName = data.branchName;
        if (data.failureCategory !== undefined)
            set.failureCategory = data.failureCategory;
        if (data.failureSummary !== undefined)
            set.failureSummary = data.failureSummary;
        if (data.pushStrategy !== undefined)
            set.pushStrategy = data.pushStrategy;
        if (data.prUrl !== undefined)
            set.prUrl = data.prUrl;
        if (data.analysisSummary !== undefined)
            set.analysisSummary = data.analysisSummary;
        if (Object.keys(set).length === 0)
            return;
        await withRetry('RunRepository.updateProgress', () => Run.findByIdAndUpdate(runId, { $set: set }, { timestamps: true }));
    },
    /**
     * Atomically write final scoring fields and transition status to 'completed'.
     * Transaction is required: score + status must be consistent if the run is read
     * between partial writes.
     */
    async finalizeScoring(runId, scoring) {
        const t0 = Date.now();
        await withRetry('RunRepository.finalizeScoring', () => withTransaction(async (session) => {
            const run = await Run.findById(runId).session(session);
            if (!run)
                return;
            const fromStatus = run.status;
            const toStatus = 'completed';
            run.baseScore = scoring.baseScore;
            run.speedBonus = scoring.speedBonus;
            run.efficiencyPenalty = scoring.efficiencyPenalty;
            run.executionTimeS = scoring.executionTimeS;
            run.ciStatus = scoring.ciStatus;
            run.failuresCount = scoring.failuresCount;
            run.status = toStatus;
            run.finishedAt = new Date();
            await run.save({ session });
            await StatusTransition.create([{
                    runId, fromStatus, toStatus, reason: 'Scoring finalized',
                }], { session });
        }));
        dbLog({ level: 'info', operation: 'RunRepository.finalizeScoring', message: `Run ${runId} completed`, durationMs: Date.now() - t0 });
    },
    /**
     * Return the full RunResult by fetching Run + sub-collections in a
     * single aggregation round-trip using $lookup.
     *
     * Replaces the previous 4 parallel Promise.all() queries (N+1 pattern).
     */
    async getFullResult(runId) {
        const t0 = Date.now();
        const docs = await withRetry('RunRepository.getFullResult', () => Run.aggregate([
            { $match: { _id: runId } },
            // --- patches ---
            {
                $lookup: {
                    from: 'patches',
                    let: { rid: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$runId', '$$rid'] } } },
                        { $sort: { iteration: 1 } },
                        { $project: { _id: 0, filePath: 1, bugType: 1, lineNumber: 1, description: 1, status: 1 } },
                    ],
                    as: 'patches',
                },
            },
            // --- timeline entries ---
            {
                $lookup: {
                    from: 'timelineentries',
                    let: { rid: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$runId', '$$rid'] } } },
                        { $sort: { iteration: 1 } },
                        { $project: { _id: 0, iteration: 1, result: 1, createdAt: 1, retryCount: 1, retryLimit: 1 } },
                    ],
                    as: 'timeline',
                },
            },
            // --- latest test result only ---
            {
                $lookup: {
                    from: 'testresults',
                    let: { rid: '$_id' },
                    pipeline: [
                        { $match: { $expr: { $eq: ['$runId', '$$rid'] } } },
                        { $sort: { _id: -1 } },
                        { $limit: 1 },
                        { $project: { _id: 0, passed: 1, exitCode: 1, stdout: 1, stderr: 1, durationMs: 1, failedTests: 1, errorSummary: 1, executionMethod: 1 } },
                    ],
                    as: 'latestTestResult',
                },
            },
            { $limit: 1 },
        ]));
        dbLog({ level: 'info', operation: 'RunRepository.getFullResult', message: `Aggregation complete for run ${runId}`, durationMs: Date.now() - t0 });
        if (!docs || docs.length === 0)
            return null;
        const d = docs[0];
        const latestTest = d.latestTestResult?.[0] ?? {
            passed: false, exitCode: -1, stdout: '', stderr: '',
            durationMs: 0, failedTests: [], errorSummary: '', executionMethod: 'skipped',
        };
        return {
            executionTime: d.executionTimeS,
            ciStatus: d.ciStatus,
            failuresCount: d.failuresCount,
            fixesCount: d.fixesCount,
            commitCount: d.commitCount,
            fixesTable: d.patches.map((p) => ({
                filePath: p.filePath,
                bugType: p.bugType,
                lineNumber: p.lineNumber,
                commitMessage: p.description,
                status: p.status,
            })),
            timeline: d.timeline.map((t) => ({
                iteration: t.iteration,
                result: t.result,
                timestamp: new Date(t.createdAt).toISOString(),
                retryCount: t.retryCount,
                retryLimit: t.retryLimit,
            })),
            baseScore: d.baseScore,
            speedBonus: d.speedBonus,
            efficiencyPenalty: d.efficiencyPenalty,
            repoUrl: d.repoUrl,
            generatedBranchName: d.branchName,
            analysisSummary: d.analysisSummary,
            testResults: {
                passed: latestTest.passed,
                exitCode: latestTest.exitCode,
                stdout: latestTest.stdout,
                stderr: latestTest.stderr,
                durationMs: latestTest.durationMs,
                failedTests: Array.isArray(latestTest.failedTests) ? latestTest.failedTests : [],
                errorSummary: latestTest.errorSummary,
                executionMethod: latestTest.executionMethod,
            },
            projectType: d.projectType,
            failureCategory: d.failureCategory,
            failureSummary: d.failureSummary,
            pushStrategy: d.pushStrategy,
            prUrl: d.prUrl,
        };
    },
    /** List most recent runs — excludes large sub-document fields. */
    async listRecent(limit = 50) {
        return withRetry('RunRepository.listRecent', async () => {
            const runs = await Run.find()
                .sort({ createdAt: -1 })
                .limit(limit)
                .lean();
            return runs.map(toRunRecord);
        });
    },
};
//# sourceMappingURL=RunRepository.js.map