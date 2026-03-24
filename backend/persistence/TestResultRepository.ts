/**
 * TestResultRepository — Full stdout/stderr output for each test execution.
 *
 * Text fields (stdout, stderr) can be large. They are intentionally stored here
 * rather than on the Run document to avoid bloating every findById call.
 */

import { withRetry, dbLog } from './db.js';
import { TestResult } from './models/TestResult.js';
import type { TestExecutionResult } from '../types/agent.js';

export const TestResultRepository = {

  async create(
    runId: string,
    iteration: number,
    phase: 'baseline' | 'verification',
    result: TestExecutionResult,
  ): Promise<void> {
    const t0 = Date.now();
    await withRetry('TestResultRepository.create', () =>
      TestResult.create({
        runId,
        iteration,
        phase,
        passed: result.passed,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        failedTests: result.failedTests,
        errorSummary: result.errorSummary,
        executionMethod: result.executionMethod,
      }),
    );
    dbLog({
      level: 'info',
      operation: 'TestResultRepository.create',
      message: `Stored ${phase} test result for run ${runId} iter ${iteration} (passed=${result.passed})`,
      durationMs: Date.now() - t0,
    });
  },

  async findByRunId(runId: string): Promise<Array<{ iteration: number; phase: string; result: TestExecutionResult }>> {
    return withRetry('TestResultRepository.findByRunId', async () => {
      const rows = await TestResult.find({ runId }).sort({ iteration: 1 }).lean();
      return rows.map((r: any) => ({
        iteration: r.iteration,
        phase: r.phase,
        result: {
          passed: r.passed,
          exitCode: r.exitCode,
          stdout: r.stdout,
          stderr: r.stderr,
          durationMs: r.durationMs,
          failedTests: r.failedTests ?? [],
          errorSummary: r.errorSummary,
          executionMethod: r.executionMethod as TestExecutionResult['executionMethod'],
        },
      }));
    });
  },

  async findLatest(runId: string): Promise<TestExecutionResult | null> {
    return withRetry('TestResultRepository.findLatest', async () => {
      const r: any = await TestResult.findOne({ runId }).sort({ _id: -1 }).lean();
      if (!r) return null;
      return {
        passed: r.passed,
        exitCode: r.exitCode,
        stdout: r.stdout,
        stderr: r.stderr,
        durationMs: r.durationMs,
        failedTests: r.failedTests ?? [],
        errorSummary: r.errorSummary,
        executionMethod: r.executionMethod as TestExecutionResult['executionMethod'],
      };
    });
  },
};
