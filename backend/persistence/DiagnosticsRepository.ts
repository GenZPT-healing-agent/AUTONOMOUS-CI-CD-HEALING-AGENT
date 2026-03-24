/**
 * DiagnosticsRepository — Per-iteration remediation intelligence records.
 *
 * Two collections (Diagnostic, PatchMetadata) are small per-run documents.
 * Both are written independently (no transaction needed — neither is critical path).
 * recordIteration is guarded: it no-ops if all optional data is absent.
 */

import { withRetry, dbLog } from './db.js';
import { Diagnostic } from './models/Diagnostic.js';
import { PatchMetadata } from './models/PatchMetadata.js';
import type { FailureClassification } from '../services/failureClassifier.js';
import type { PatchMetadata as PatchMetaType } from '../services/patchGuard.js';
import type { StrategyResult } from '../services/remediationStrategies.js';
import type { CommitDecision } from '../services/commitStrategy.js';
import type { PushResult } from '../services/gitStrategy.js';

export interface DiagnosticsEntry {
  iteration: number;
  failureCategory: string;
  failureSummary: string;
  confidence: number;
  matchedPatterns: string[];
  missingDeps: string[];
  faultFiles: string[];
  strategyUsed: string;
  strategyResult: string;
  commitDecision: string;
  commitReason: string;
  patchApproved: boolean;
  diffSummary: string;
  pushStrategy: string | null;
  prUrl: string | null;
}

export const DiagnosticsRepository = {

  /**
   * Record per-iteration diagnostics.
   * No-ops if none of the optional data objects are present (avoids empty rows).
   */
  async recordIteration(
    runId: string,
    iteration: number,
    data: {
      classification?: FailureClassification;
      strategyResult?: StrategyResult;
      patchMetadata?: PatchMetaType;
      commitDecision?: CommitDecision;
      pushResult?: PushResult;
    },
  ): Promise<void> {
    const { classification, strategyResult, patchMetadata, commitDecision, pushResult } = data;

    // Guard: don't insert an empty diagnostic row
    if (!classification && !strategyResult && !commitDecision && !pushResult) {
      dbLog({ level: 'warn', operation: 'DiagnosticsRepository.recordIteration', message: `Skipping empty diagnostic for run ${runId} iter ${iteration}` });
      return;
    }

    const t0 = Date.now();
    const diffSummary = patchMetadata
      ? `${patchMetadata.filesChanged} files, +${patchMetadata.linesAdded}/-${patchMetadata.linesRemoved} lines`
      : '';

    await withRetry('DiagnosticsRepository.recordIteration', () =>
      Diagnostic.create({
        runId,
        iteration,
        failureCategory: classification?.category,
        failureSummary: classification?.summary ?? '',
        confidence: classification?.confidence ?? 0,
        matchedPatterns: classification?.matchedPatterns ?? [],
        missingDeps: classification?.missingDependencies ?? [],
        faultFiles: classification?.faultFiles ?? [],
        strategyUsed: strategyResult?.strategy ?? '',
        strategyResult: strategyResult?.description ?? '',
        commitDecision: commitDecision?.shouldCommit ? 'COMMIT' : 'WITHHOLD',
        commitReason: commitDecision?.reason ?? '',
        patchApproved: patchMetadata?.approved ?? false,
        diffSummary,
        pushStrategy: pushResult?.strategy ?? null,
        prUrl: pushResult?.prUrl ?? null,
      }),
    );
    dbLog({
      level: 'info',
      operation: 'DiagnosticsRepository.recordIteration',
      message: `Diagnostics recorded for run ${runId} iter ${iteration}`,
      durationMs: Date.now() - t0,
    });
  },

  async recordPatchMetadata(
    runId: string,
    iteration: number,
    metadata: PatchMetaType,
  ): Promise<void> {
    const t0 = Date.now();
    await withRetry('DiagnosticsRepository.recordPatchMetadata', () =>
      PatchMetadata.create({
        runId,
        iteration,
        filesChanged: metadata.filesChanged ?? 0,
        linesAdded: metadata.linesAdded ?? 0,
        linesRemoved: metadata.linesRemoved ?? 0,
        totalDiffLines: metadata.totalDiffLines ?? 0,
        categoryTargeted: metadata.categoryTargeted,
        rationale: metadata.rationale ?? '',
        approved: metadata.approved ?? false,
        rejectionReason: metadata.rejectionReason ?? null,
        snapshotSha: metadata.snapshotSha ?? null,
        changedFilePaths: metadata.changedFilePaths ?? [],
      }),
    );
    dbLog({
      level: 'info',
      operation: 'DiagnosticsRepository.recordPatchMetadata',
      message: `PatchMetadata recorded for run ${runId} iter ${iteration}`,
      durationMs: Date.now() - t0,
    });
  },

  async findByRunId(runId: string): Promise<DiagnosticsEntry[]> {
    return withRetry('DiagnosticsRepository.findByRunId', async () => {
      const rows = await Diagnostic.find({ runId }).sort({ iteration: 1 }).lean();
      return rows.map((r: any) => ({
        iteration: r.iteration,
        failureCategory: r.failureCategory ?? 'UNKNOWN_FAILURE',
        failureSummary: r.failureSummary,
        confidence: r.confidence,
        matchedPatterns: r.matchedPatterns ?? [],
        missingDeps: r.missingDeps ?? [],
        faultFiles: r.faultFiles ?? [],
        strategyUsed: r.strategyUsed,
        strategyResult: r.strategyResult,
        commitDecision: r.commitDecision,
        commitReason: r.commitReason,
        patchApproved: r.patchApproved,
        diffSummary: r.diffSummary,
        pushStrategy: r.pushStrategy ?? null,
        prUrl: r.prUrl ?? null,
      }));
    });
  },

  async findPatchMetadataByRunId(runId: string): Promise<Array<{
    iteration: number;
    filesChanged: number;
    linesAdded: number;
    linesRemoved: number;
    approved: boolean;
    rejectionReason?: string;
  }>> {
    return withRetry('DiagnosticsRepository.findPatchMetadataByRunId', async () => {
      const rows = await PatchMetadata.find({ runId }).sort({ iteration: 1 }).lean();
      return rows.map((r: any) => ({
        iteration: r.iteration,
        filesChanged: r.filesChanged,
        linesAdded: r.linesAdded,
        linesRemoved: r.linesRemoved,
        approved: r.approved,
        rejectionReason: r.rejectionReason ?? undefined,
      }));
    });
  },
};
