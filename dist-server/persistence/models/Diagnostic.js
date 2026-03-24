/**
 * Diagnostic.ts — Structured per-iteration remediation intelligence record.
 * Indexed by { runId, iteration } — fetched in bulk for the diagnostics API.
 */
import mongoose, { Schema, Document } from 'mongoose';
const DiagnosticSchema = new Schema({
    runId: { type: String, required: true, ref: 'Run' },
    iteration: { type: Number, required: true },
    failureCategory: { type: String },
    failureSummary: { type: String, required: true, default: '' },
    confidence: { type: Number, required: true, default: 0 },
    matchedPatterns: { type: [String], required: true, default: [] },
    missingDeps: { type: [String], required: true, default: [] },
    faultFiles: { type: [String], required: true, default: [] },
    strategyUsed: { type: String, required: true, default: '' },
    strategyResult: { type: String, required: true, default: '' },
    commitDecision: { type: String, required: true, default: '' },
    commitReason: { type: String, required: true, default: '' },
    patchApproved: { type: Boolean, required: true, default: false },
    diffSummary: { type: String, required: true, default: '' },
    pushStrategy: { type: String },
    prUrl: { type: String },
    createdAt: { type: Date, required: true, default: Date.now },
});
/* Compound index: all diagnostics ordered by iteration per run */
DiagnosticSchema.index({ runId: 1, iteration: 1 });
export const Diagnostic = mongoose.models.Diagnostic ??
    mongoose.model('Diagnostic', DiagnosticSchema);
//# sourceMappingURL=Diagnostic.js.map