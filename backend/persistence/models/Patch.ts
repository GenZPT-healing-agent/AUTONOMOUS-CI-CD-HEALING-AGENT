/**
 * Patch.ts — Individual file-level fix record applied during remediation.
 * Indexed by { runId, iteration } for bulk fetches per run/iteration.
 */

import mongoose, { Schema, Document } from 'mongoose';
import { ALLOWED_BUG_TYPES, type BugType } from '../../types/agent.js';

export interface IPatch extends Document {
  runId: string;
  iteration: number;
  filePath: string;
  bugType: BugType;
  lineNumber: number;
  description: string;
  status: 'passed' | 'failed';
  commitSha?: string;
  createdAt: Date;
}

const PatchSchema = new Schema<IPatch>({
  runId: { type: String, required: true, ref: 'Run' },
  iteration: { type: Number, required: true },
  filePath: { type: String, required: true },
  bugType: { type: String, required: true, enum: ALLOWED_BUG_TYPES },
  lineNumber: { type: Number, required: true },
  description: { type: String, required: true, default: '' },
  status: { type: String, required: true, enum: ['passed', 'failed'] },
  commitSha: { type: String },
  createdAt: { type: Date, required: true, default: Date.now },
});

/* Primary access pattern: all patches for a run, ordered by iteration */
PatchSchema.index({ runId: 1, iteration: 1 });

export const Patch = mongoose.models.Patch ?? mongoose.model<IPatch>('Patch', PatchSchema);
