/**
 * Run.ts — Mongoose schema for a healing-agent execution run.
 *
 * Notes:
 *  • _id is a UUID string (set by the caller) matching the BullMQ job ID.
 *  • rawStderr is intentionally NOT stored here — it lives in TestResult.stderr.
 *  • Compound index { status, createdAt } covers countActiveRuns + listRecent.
 */
import mongoose, { Schema, Document } from 'mongoose';
const RunSchema = new Schema({
    _id: { type: String, required: true },
    repoUrl: { type: String, required: true },
    teamName: { type: String, required: true },
    leaderName: { type: String, required: true },
    retryLimit: { type: Number, required: true, default: 5 },
    status: {
        type: String,
        required: true,
        default: 'queued',
        enum: ['queued', 'running', 'completed', 'failed'],
    },
    ciStatus: {
        type: String,
        required: true,
        default: 'pending',
        enum: ['pending', 'running', 'passed', 'failed'],
    },
    branchName: { type: String, required: true, default: '' },
    projectType: { type: String, required: true, default: 'unknown' },
    failuresCount: { type: Number, required: true, default: 0 },
    fixesCount: { type: Number, required: true, default: 0 },
    commitCount: { type: Number, required: true, default: 0 },
    currentIteration: { type: Number, required: true, default: 0 },
    baseScore: { type: Number, required: true, default: 0 },
    speedBonus: { type: Number, required: true, default: 0 },
    efficiencyPenalty: { type: Number, required: true, default: 0 },
    executionTimeS: { type: Number, required: true, default: 0 },
    analysisSummary: { type: Schema.Types.Mixed, required: true, default: {} },
    error: { type: String },
    startedAt: { type: Date, required: true, default: Date.now },
    finishedAt: { type: Date },
    failureCategory: { type: String },
    failureSummary: { type: String },
    pushStrategy: { type: String },
    prUrl: { type: String },
}, { timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' } });
/* ── Indexes ── */
// Covers: listRecent (createdAt DESC) and countActiveRuns ({ status: 'running' })
RunSchema.index({ status: 1, createdAt: -1 });
export const Run = mongoose.models.Run ?? mongoose.model('Run', RunSchema);
//# sourceMappingURL=Run.js.map