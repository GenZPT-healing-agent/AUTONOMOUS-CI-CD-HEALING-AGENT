/**
 * TimelineEntry.ts — Per-iteration pass/fail record rendered by the dashboard.
 * Indexed by { runId, iteration } — same access pattern as Patch.
 */
import mongoose, { Schema, Document } from 'mongoose';
const TimelineEntrySchema = new Schema({
    runId: { type: String, required: true, ref: 'Run' },
    iteration: { type: Number, required: true },
    result: { type: String, required: true, enum: ['passed', 'failed'] },
    retryCount: { type: Number, required: true },
    retryLimit: { type: Number, required: true },
    createdAt: { type: Date, required: true, default: Date.now },
});
/* Compound index: fetch timeline ordered by iteration */
TimelineEntrySchema.index({ runId: 1, iteration: 1 });
export const TimelineEntry = mongoose.models.TimelineEntry ??
    mongoose.model('TimelineEntry', TimelineEntrySchema);
//# sourceMappingURL=TimelineEntry.js.map