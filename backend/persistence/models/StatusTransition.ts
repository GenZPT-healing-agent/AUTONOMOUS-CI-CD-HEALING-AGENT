/**
 * StatusTransition.ts — Immutable audit log of every run status change.
 * Indexed by { runId, createdAt } for chronological fetches per run.
 */

import mongoose, { Schema, Document } from 'mongoose';
import type { RunStatus } from '../../types/agent.js';

export interface IStatusTransition extends Document {
  runId: string;
  fromStatus: RunStatus | null;
  toStatus: RunStatus;
  reason: string;
  createdAt: Date;
}

const StatusTransitionSchema = new Schema<IStatusTransition>({
  runId: { type: String, required: true, ref: 'Run' },
  fromStatus: {
    type: String,
    enum: ['queued', 'running', 'completed', 'failed', null],
    default: null,
  },
  toStatus: {
    type: String,
    required: true,
    enum: ['queued', 'running', 'completed', 'failed'],
  },
  reason: { type: String, required: true, default: '' },
  createdAt: { type: Date, required: true, default: Date.now },
});

/* Compound index: fetch all transitions for a run in order */
StatusTransitionSchema.index({ runId: 1, createdAt: 1 });

export const StatusTransition =
  mongoose.models.StatusTransition ??
  mongoose.model<IStatusTransition>('StatusTransition', StatusTransitionSchema);
