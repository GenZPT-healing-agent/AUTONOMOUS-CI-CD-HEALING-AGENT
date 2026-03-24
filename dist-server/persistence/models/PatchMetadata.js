/**
 * PatchMetadata.ts — Guard-layer record tracking diff safety metrics per iteration.
 * Indexed by { runId, iteration } — same access pattern as Diagnostic.
 */
import mongoose, { Schema, Document } from 'mongoose';
const PatchMetadataSchema = new Schema({
    runId: { type: String, required: true, ref: 'Run' },
    iteration: { type: Number, required: true },
    filesChanged: { type: Number, required: true, default: 0 },
    linesAdded: { type: Number, required: true, default: 0 },
    linesRemoved: { type: Number, required: true, default: 0 },
    totalDiffLines: { type: Number, required: true, default: 0 },
    categoryTargeted: { type: String },
    rationale: { type: String, required: true, default: '' },
    approved: { type: Boolean, required: true, default: false },
    rejectionReason: { type: String },
    snapshotSha: { type: String },
    changedFilePaths: { type: [String], required: true, default: [] },
    createdAt: { type: Date, required: true, default: Date.now },
});
/* Compound index */
PatchMetadataSchema.index({ runId: 1, iteration: 1 });
export const PatchMetadata = mongoose.models.PatchMetadata ??
    mongoose.model('PatchMetadata', PatchMetadataSchema);
//# sourceMappingURL=PatchMetadata.js.map