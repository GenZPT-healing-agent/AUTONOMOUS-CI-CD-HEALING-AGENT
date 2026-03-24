/**
 * TestResult.ts — Full output of each test/build execution during a run.
 *
 * stdout/stderr are large fields intentionally kept here (not on Run)
 * to avoid bloating the Run document on every findById call.
 * Indexed by { runId, iteration } for history + { runId, _id DESC } for latest-fetch.
 */

import mongoose, { Schema, Document } from 'mongoose';

export interface ITestResult extends Document {
  runId: string;
  iteration: number;
  phase: 'baseline' | 'verification';
  passed: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  failedTests: string[];
  errorSummary: string;
  executionMethod: 'docker' | 'subprocess' | 'skipped';
  createdAt: Date;
}

const TestResultSchema = new Schema<ITestResult>({
  runId: { type: String, required: true, ref: 'Run' },
  iteration: { type: Number, required: true },
  phase: { type: String, required: true, enum: ['baseline', 'verification'] },
  passed: { type: Boolean, required: true },
  exitCode: { type: Number, required: true },
  stdout: { type: String, required: true, default: '' },
  stderr: { type: String, required: true, default: '' },
  durationMs: { type: Number, required: true, default: 0 },
  failedTests: { type: [String], required: true, default: [] },
  errorSummary: { type: String, required: true, default: '' },
  executionMethod: {
    type: String,
    required: true,
    default: 'skipped',
    enum: ['docker', 'subprocess', 'skipped'],
  },
  createdAt: { type: Date, required: true, default: Date.now },
});

/* Used by findLatest (sort: { _id: -1 }) and history fetch */
TestResultSchema.index({ runId: 1, iteration: 1 });

export const TestResult =
  mongoose.models.TestResult ??
  mongoose.model<ITestResult>('TestResult', TestResultSchema);
