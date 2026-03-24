/**
 * PatchRepository — Persist file patches and per-iteration timeline entries.
 *
 * Patches + timeline are written atomically in a single transaction per iteration
 * because both documents are semantically part of the same remediation event.
 */

import { withTransaction, withRetry, dbLog } from './db.js';
import { Patch } from './models/Patch.js';
import { TimelineEntry } from './models/TimelineEntry.js';
import type { FixRow, TimelineEntry as TimelineEntryType } from '../types/agent.js';

export const PatchRepository = {

  /**
   * Atomically insert patches + a timeline entry for one remediation iteration.
   * Transaction is justified: both documents represent the same discrete event.
   */
  async recordIteration(
    runId: string,
    iteration: number,
    patches: FixRow[],
    timelineEntry: TimelineEntryType,
    commitSha?: string,
  ): Promise<void> {
    const t0 = Date.now();
    await withRetry('PatchRepository.recordIteration', () =>
      withTransaction(async (session) => {
        if (patches.length > 0) {
          await Patch.insertMany(
            patches.map((p) => ({
              runId,
              iteration,
              filePath: p.filePath,
              bugType: p.bugType,
              lineNumber: p.lineNumber,
              description: p.commitMessage,
              status: p.status,
              commitSha,
            })),
            { session },
          );
        }

        await TimelineEntry.create(
          [{
            runId,
            iteration: timelineEntry.iteration,
            result: timelineEntry.result,
            retryCount: timelineEntry.retryCount,
            retryLimit: timelineEntry.retryLimit,
          }],
          { session },
        );
      }),
    );
    dbLog({
      level: 'info',
      operation: 'PatchRepository.recordIteration',
      message: `Recorded ${patches.length} patch(es) + timeline for run ${runId} iter ${iteration}`,
      durationMs: Date.now() - t0,
    });
  },

  async findByRunId(runId: string): Promise<FixRow[]> {
    return withRetry('PatchRepository.findByRunId', async () => {
      const rows = await Patch.find({ runId }).sort({ iteration: 1 }).lean();
      return rows.map((p: any) => ({
        filePath: p.filePath,
        bugType: p.bugType as FixRow['bugType'],
        lineNumber: p.lineNumber,
        commitMessage: p.description,
        status: p.status as 'passed' | 'failed',
      }));
    });
  },

  async findTimelineByRunId(runId: string): Promise<TimelineEntryType[]> {
    return withRetry('PatchRepository.findTimelineByRunId', async () => {
      const rows = await TimelineEntry.find({ runId }).sort({ iteration: 1 }).lean();
      return rows.map((r: any) => ({
        iteration: r.iteration,
        result: r.result as 'passed' | 'failed',
        timestamp: r.createdAt.toISOString(),
        retryCount: r.retryCount,
        retryLimit: r.retryLimit,
      }));
    });
  },
};
