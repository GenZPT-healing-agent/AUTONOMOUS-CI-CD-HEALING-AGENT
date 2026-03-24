import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { cloneRepository, scanForIssues, cleanupWorkspace, } from "../services/dockerSandbox.js";
import { applyAllPatches } from "../services/patchEngine.js";
import { configureGitIdentity, createBranch, stageAndCommit, } from "../services/gitService.js";
import { pushWithStrategy } from "../services/gitStrategy.js";
import { generateBranchName } from "../services/branch.js";
import { detectProjectType, executeTests } from "../services/testRunner.js";
import { classifyFailure, severityRank } from "../services/failureClassifier.js";
import { validatePatchImpact, rollbackToSnapshot, takeSnapshot, discardStagedChanges } from "../services/patchGuard.js";
import { executeRemediationStrategy } from "../services/remediationStrategies.js";
import { makeCommitDecision } from "../services/commitStrategy.js";
import { validateRepoSize, validateMemory, clearInstallCache } from "../services/executionGuard.js";
import { RunRepository, TestResultRepository, PatchRepository, DiagnosticsRepository, } from "../persistence/index.js";
export const AGENT_PIPELINE = [
    "planner",
    "analyzer",
    "remediator",
    "verifier",
    "scorer",
];
/* Tracks active clone paths per runId for error-path cleanup */
const activeClonePaths = new Map();
const AgentState = Annotation.Root({
    runId: (Annotation),
    repoUrl: (Annotation),
    teamName: (Annotation),
    leaderName: (Annotation),
    retryLimit: (Annotation),
    generatedBranchName: (Annotation),
    startedAtMs: (Annotation),
    analysisSummary: (Annotation),
    fixesTable: (Annotation),
    timeline: (Annotation),
    failuresCount: (Annotation),
    fixesCount: (Annotation),
    commitCount: (Annotation),
    ciStatus: (Annotation),
    baseScore: (Annotation),
    speedBonus: (Annotation),
    efficiencyPenalty: (Annotation),
    executionTime: (Annotation),
    clonePath: (Annotation),
    currentIteration: (Annotation),
    projectConfig: (Annotation),
    testResults: (Annotation),
    // ── Enterprise Hardening ──
    failureCategory: (Annotation),
    failureSummary: (Annotation),
    rawStderr: (Annotation),
    pushStrategy: (Annotation),
    prUrl: (Annotation),
    prePatChSnapshot: (Annotation),
    previousFailureCategory: (Annotation),
});
const plannerAgent = async (state) => ({
    generatedBranchName: generateBranchName(state.teamName, state.leaderName),
    ciStatus: "running",
    currentIteration: 0,
});
const analyzerAgent = async (state) => {
    const clonePath = await cloneRepository(state.repoUrl);
    activeClonePaths.set(state.runId, clonePath);
    // ── Phase 7: Validate repo size before proceeding ──
    const sizeCheck = await validateRepoSize(clonePath);
    if (!sizeCheck.ok) {
        console.warn(`[analyzer] Repo too large: ${sizeCheck.sizeMB}MB > ${sizeCheck.limitMB}MB limit`);
        // Allow processing but log the warning
    }
    console.log(`[analyzer] Repo size: ~${sizeCheck.sizeMB}MB`);
    await configureGitIdentity(clonePath);
    await createBranch(clonePath, state.generatedBranchName);
    // ── Auto-detect project type for real test execution ──
    const projectConfig = await detectProjectType(clonePath);
    console.log(`[analyzer] Detected project type: ${projectConfig.type}, hasTests: ${projectConfig.hasTests}`);
    // ── Run REAL tests / build to establish a baseline ──
    const testResults = await executeTests(clonePath, projectConfig);
    console.log(`[analyzer] Initial test run — passed: ${testResults.passed}, ` +
        `exit: ${testResults.exitCode}, failures: ${testResults.failedTests.length}`);
    // ── Phase 1: Classify the failure BEFORE any remediation ──
    const classification = classifyFailure({
        stderr: testResults.stderr,
        stdout: testResults.stdout,
        exitCode: testResults.exitCode,
        projectType: projectConfig.type,
    });
    console.log(`[classification] Category: ${classification.category}, ` +
        `confidence: ${classification.confidence.toFixed(2)}, ` +
        `remediable: ${classification.remediable}, ` +
        `strategy: ${classification.suggestedStrategy}`);
    if (classification.missingDependencies.length > 0) {
        console.log(`[classification] Missing deps: ${classification.missingDependencies.join(', ')}`);
    }
    // ── Persist baseline test result to Postgres ──
    await TestResultRepository.create(state.runId, 0, 'baseline', testResults);
    // ── Also run the static regex scan (provides patchable issues) ──
    const analysisSummary = await scanForIssues(clonePath);
    // CI status is now driven by REAL test results, not regex matches.
    const realFailures = testResults.passed
        ? 0
        : Math.max(1, testResults.failedTests.length);
    const totalFailures = realFailures + analysisSummary.detectedIssues.length;
    const ciStatus = testResults.passed
        ? (analysisSummary.detectedIssues.length === 0 ? "passed" : "running")
        : "running";
    // ── Persist progress + classification to Postgres ──
    await RunRepository.updateProgress(state.runId, {
        ciStatus,
        projectType: projectConfig.type,
        failuresCount: totalFailures,
        analysisSummary,
        failureCategory: classification.category,
        failureSummary: classification.summary,
    });
    // ── Record baseline diagnostics ──
    await DiagnosticsRepository.recordIteration(state.runId, 0, {
        classification,
    });
    return {
        clonePath,
        projectConfig,
        testResults,
        analysisSummary,
        failuresCount: totalFailures,
        ciStatus,
        failureCategory: classification.category,
        failureSummary: classification.summary,
        rawStderr: testResults.stderr,
        previousFailureCategory: classification.category,
    };
};
const remediationAgent = async (state) => {
    const iteration = state.currentIteration + 1;
    const failureCategory = (state.failureCategory || 'UNKNOWN_FAILURE');
    console.log(`[remediator] Iteration ${iteration} — category: ${failureCategory}, ` +
        `strategy: ${state.failureSummary?.slice(0, 80) ?? 'none'}`);
    // ── Phase 7: Memory check ──
    const memCheck = validateMemory();
    if (!memCheck.ok) {
        console.warn(`[remediator] Memory high: ${memCheck.usedMB}MB / ${memCheck.limitMB}MB`);
    }
    // ── Phase 3: No patching without classification ──
    if (failureCategory === 'UNKNOWN_FAILURE' && state.testResults.passed) {
        console.log('[remediator] Tests pass and no classified failure — skipping remediation');
        const timelineEntry = {
            iteration,
            result: "passed",
            timestamp: new Date().toISOString(),
            retryCount: iteration,
            retryLimit: state.retryLimit,
        };
        await PatchRepository.recordIteration(state.runId, iteration, [], timelineEntry);
        await RunRepository.updateProgress(state.runId, {
            currentIteration: iteration,
            ciStatus: 'passed',
        });
        return {
            currentIteration: iteration,
            ciStatus: "passed",
            timeline: [...state.timeline, timelineEntry],
        };
    }
    // ── Phase 2: Take pre-patch snapshot for rollback ──
    const snapshotSha = await takeSnapshot(state.clonePath) ?? '';
    // ── Phase 3: Execute classification-driven remediation strategy ──
    const classification = classifyFailure({
        stderr: state.testResults.stderr,
        stdout: state.testResults.stdout,
        exitCode: state.testResults.exitCode,
        projectType: state.projectConfig.type,
    });
    const strategyResult = await executeRemediationStrategy(state.clonePath, classification, state.projectConfig.type);
    console.log(`[remediation-strategy] Applied: ${strategyResult.applied}, ` +
        `files modified: ${strategyResult.filesModified.join(', ') || 'none'}, ` +
        `proceed to static: ${strategyResult.proceedToStaticPatch}`);
    // ── Apply static patches only if strategy says to AND there are regex-detected issues ──
    const issues = Array.isArray(state.analysisSummary.detectedIssues)
        ? state.analysisSummary.detectedIssues
        : [];
    let patchResults = [];
    if (strategyResult.proceedToStaticPatch && issues.length > 0) {
        patchResults = await applyAllPatches(issues, state.clonePath);
    }
    else if (!strategyResult.applied && issues.length > 0) {
        // If strategy had no effect but we have static issues, try static patches
        patchResults = await applyAllPatches(issues, state.clonePath);
    }
    const applied = patchResults.filter((p) => p.applied);
    const failed = patchResults.filter((p) => !p.applied);
    const newFixes = [
        ...applied.map((p) => ({
            filePath: p.filePath,
            bugType: p.bugType,
            lineNumber: p.lineNumber,
            commitMessage: p.description,
            status: "passed",
        })),
        ...failed.map((p) => ({
            filePath: p.filePath,
            bugType: p.bugType,
            lineNumber: p.lineNumber,
            commitMessage: p.description,
            status: "failed",
        })),
    ];
    // ── Phase 2: Validate patch impact BEFORE committing ──
    const patchMetadata = await validatePatchImpact(state.clonePath, failureCategory, strategyResult.description);
    console.log(`[patch-validation] Files: ${patchMetadata.filesChanged}, ` +
        `diff: +${patchMetadata.linesAdded}/-${patchMetadata.linesRemoved}, ` +
        `approved: ${patchMetadata.approved}`);
    // Persist patch metadata
    await DiagnosticsRepository.recordPatchMetadata(state.runId, iteration, patchMetadata);
    // ── Phase 2: If patch rejected, rollback and record ──
    if (!patchMetadata.approved) {
        console.warn(`[patch-validation] Patch REJECTED: ${patchMetadata.rejectionReason}`);
        await discardStagedChanges(state.clonePath);
        const timelineEntry = {
            iteration,
            result: "failed",
            timestamp: new Date().toISOString(),
            retryCount: iteration,
            retryLimit: state.retryLimit,
        };
        await PatchRepository.recordIteration(state.runId, iteration, newFixes, timelineEntry);
        await DiagnosticsRepository.recordIteration(state.runId, iteration, {
            classification,
            strategyResult,
            patchMetadata,
            commitDecision: {
                shouldCommit: false,
                reason: `Patch rejected: ${patchMetadata.rejectionReason}`,
            },
        });
        await RunRepository.updateProgress(state.runId, {
            currentIteration: iteration,
        });
        return {
            fixesTable: [...state.fixesTable, ...newFixes],
            timeline: [...state.timeline, timelineEntry],
            currentIteration: iteration,
            prePatChSnapshot: snapshotSha,
        };
    }
    // ── Phase 5: Run targeted test to validate patch before full suite ──
    const targetedTestResults = await executeTests(state.clonePath, state.projectConfig);
    await TestResultRepository.create(state.runId, iteration, 'verification', targetedTestResults);
    // ── Phase 3: Classify post-patch failure ──
    const postPatchClassification = classifyFailure({
        stderr: targetedTestResults.stderr,
        stdout: targetedTestResults.stdout,
        exitCode: targetedTestResults.exitCode,
        projectType: state.projectConfig.type,
    });
    // ── Phase 5: Intelligent commit decision ──
    const commitDecision = makeCommitDecision({
        previousCategory: failureCategory,
        currentCategory: postPatchClassification.category,
        testsPass: targetedTestResults.passed,
        testsPreviouslyPassed: state.testResults.passed,
        patchMetadata,
        rootCause: classification.summary,
        remediationDescription: strategyResult.description,
        iteration,
    });
    console.log(`[commit-strategy] Decision: ${commitDecision.shouldCommit ? 'COMMIT' : 'WITHHOLD'}, ` +
        `reason: ${commitDecision.reason}`);
    let commitCount = state.commitCount;
    let commitSha;
    if (commitDecision.shouldCommit && (applied.length > 0 || strategyResult.applied)) {
        const msg = commitDecision.message
            ?? `[AI-AGENT] fix: apply ${applied.length} automated fixes (iteration ${iteration})`;
        const result = await stageAndCommit(state.clonePath, msg);
        if (result.commitSha) {
            commitSha = result.commitSha;
            commitCount += 1;
            console.log(`[agent] Committed ${result.filesChanged} file(s) — ${result.commitSha.slice(0, 8)}`);
        }
    }
    else if (!commitDecision.shouldCommit && patchMetadata.filesChanged > 0) {
        // ── Phase 3: Rollback if commit was withheld and things got worse ──
        const prevSeverity = severityRank(failureCategory);
        const currSeverity = severityRank(postPatchClassification.category);
        if (currSeverity < prevSeverity && snapshotSha) {
            console.log(`[rollback] Patch worsened severity — rolling back to ${snapshotSha.slice(0, 8)}`);
            await rollbackToSnapshot(state.clonePath, snapshotSha);
        }
        else {
            // Stage and commit even though tests still fail — improvement was detected
            if (applied.length > 0 || strategyResult.applied) {
                try {
                    await discardStagedChanges(state.clonePath);
                }
                catch { /* may already be clean */ }
            }
        }
    }
    const timelineEntry = {
        iteration,
        result: targetedTestResults.passed ? "passed" : "failed",
        timestamp: new Date().toISOString(),
        retryCount: iteration,
        retryLimit: state.retryLimit,
    };
    // ── Persist everything atomically ──
    await PatchRepository.recordIteration(state.runId, iteration, newFixes, timelineEntry, commitSha);
    await DiagnosticsRepository.recordIteration(state.runId, iteration, {
        classification,
        strategyResult,
        patchMetadata,
        commitDecision,
    });
    await RunRepository.updateProgress(state.runId, {
        fixesCount: state.fixesTable.length + applied.length,
        commitCount,
        currentIteration: iteration,
        failureCategory: postPatchClassification.category,
        failureSummary: postPatchClassification.summary,
    });
    return {
        fixesTable: [...state.fixesTable, ...newFixes],
        timeline: [...state.timeline, timelineEntry],
        fixesCount: state.fixesTable.length + applied.length,
        commitCount,
        currentIteration: iteration,
        testResults: targetedTestResults,
        failureCategory: postPatchClassification.category,
        failureSummary: postPatchClassification.summary,
        prePatChSnapshot: snapshotSha,
        previousFailureCategory: failureCategory,
        ciStatus: targetedTestResults.passed ? "passed" : "failed",
    };
};
// ── Verifier: re-classify post-patch state and decide whether to retry ──
const verifierAgent = async (state) => {
    if (state.ciStatus === "passed") {
        return {};
    }
    // The remediation agent already ran tests and classified.
    // Verifier now re-scans for static issues to track remaining code quality.
    const freshAnalysis = await scanForIssues(state.clonePath);
    const remaining = freshAnalysis.detectedIssues.length;
    // CI status is driven by REAL test exit code (already set by remediator).
    const ciStatus = state.testResults.passed ? "passed" : "failed";
    const failuresCount = state.testResults.passed
        ? remaining
        : remaining + Math.max(1, state.testResults.failedTests.length);
    // ── Persist progress to Postgres ──
    await RunRepository.updateProgress(state.runId, {
        ciStatus,
        failuresCount,
        analysisSummary: freshAnalysis,
    });
    return {
        analysisSummary: freshAnalysis,
        failuresCount,
        ciStatus,
    };
};
// ── Conditional routing: retry remediation or proceed to scoring ──
const routeAfterVerification = (state) => {
    if (state.ciStatus === "passed")
        return "scorer";
    if (state.currentIteration >= state.retryLimit)
        return "scorer";
    return "remediator";
};
const scoringAgent = async (state) => {
    let pushStrategy = '';
    let prUrl = '';
    // ── Phase 4: Intelligent push strategy (direct or fork+PR) ──
    const githubToken = process.env.GITHUB_TOKEN?.trim();
    if (githubToken && state.clonePath && state.commitCount > 0) {
        try {
            const failureCat = (state.failureCategory || 'UNKNOWN_FAILURE');
            const commitTitle = `fix(ci): resolve ${failureCat.toLowerCase().replace(/_/g, '-')}`;
            const commitBody = [
                `Root cause: ${state.failureSummary || 'Unknown'}`,
                ``,
                `Automated remediation by AI Healing Agent.`,
                `- Failure category: ${state.failureCategory}`,
                `- Iterations: ${state.currentIteration}`,
                `- Commits: ${state.commitCount}`,
                `- CI status: ${state.ciStatus}`,
            ].join('\n');
            console.log(`[push-strategy] Attempting push for ${state.repoUrl}...`);
            const pushResult = await pushWithStrategy({
                repoPath: state.clonePath,
                branchName: state.generatedBranchName,
                repoUrl: state.repoUrl,
                token: githubToken,
                commitTitle,
                commitBody,
            });
            pushStrategy = pushResult.strategy;
            prUrl = pushResult.prUrl ?? '';
            if (pushResult.success) {
                console.log(`[push-strategy] Success — strategy: ${pushResult.strategy}, ` +
                    `PR: ${pushResult.prUrl ?? 'N/A'}`);
            }
            else {
                console.warn(`[push-strategy] Push failed (non-fatal): ${pushResult.error}`);
            }
            // Record push diagnostics
            await DiagnosticsRepository.recordIteration(state.runId, state.currentIteration + 100, {
                pushResult,
            });
        }
        catch (err) {
            console.warn(`[push-strategy] Push skipped: ${err instanceof Error ? err.message : "unknown error"}`);
        }
    }
    else if (!githubToken) {
        console.warn("[agent] GITHUB_TOKEN not set — patches applied locally only, push skipped.");
    }
    // ── Phase 9: Clean install cache ──
    clearInstallCache(state.runId);
    // ── Cleanup the cloned workspace ──
    if (state.clonePath) {
        await cleanupWorkspace(state.clonePath);
        activeClonePaths.delete(state.runId);
    }
    // ── Compute run score — now based on real test outcomes ──
    const executionTime = Math.max(1, Math.round((Date.now() - state.startedAtMs) / 1000));
    // Base score: 100 if real tests pass, 40 if they still fail,
    // 70 if tests were skipped (unknown project type).
    let baseScore;
    if (state.testResults.executionMethod === 'skipped') {
        baseScore = 70; // Tests couldn't run — partial credit at best
    }
    else if (state.testResults.passed) {
        baseScore = 100;
    }
    else {
        baseScore = 40;
    }
    const speedBonus = executionTime < 300 ? 10 : 0;
    const efficiencyPenalty = Math.max(0, state.commitCount - 20) * 2;
    // ── Persist final state + enterprise fields ──
    await RunRepository.updateProgress(state.runId, {
        pushStrategy,
        prUrl: prUrl || undefined,
        failureCategory: state.failureCategory,
        failureSummary: state.failureSummary,
    });
    // ── Atomically persist final scoring to Postgres ──
    await RunRepository.finalizeScoring(state.runId, {
        baseScore,
        speedBonus,
        efficiencyPenalty,
        executionTimeS: executionTime,
        ciStatus: state.ciStatus,
        failuresCount: state.failuresCount,
    });
    return {
        executionTime,
        baseScore,
        speedBonus,
        efficiencyPenalty,
        pushStrategy,
        prUrl,
    };
};
const graph = new StateGraph(AgentState)
    .addNode("planner", plannerAgent)
    .addNode("analyzer", analyzerAgent)
    .addNode("remediator", remediationAgent)
    .addNode("verifier", verifierAgent)
    .addNode("scorer", scoringAgent)
    .addEdge(START, "planner")
    .addEdge("planner", "analyzer")
    .addEdge("analyzer", "remediator")
    .addEdge("remediator", "verifier")
    .addConditionalEdges("verifier", routeAfterVerification)
    .addEdge("scorer", END)
    .compile();
export const runAgentGraph = async (input) => {
    const startedAtMs = Date.now();
    try {
        const finalState = await graph.invoke({
            runId: input.runId,
            repoUrl: input.repoUrl,
            teamName: input.teamName,
            leaderName: input.leaderName,
            retryLimit: input.retryLimit,
            generatedBranchName: "",
            startedAtMs,
            analysisSummary: {
                totalFiles: 0,
                dominantLanguage: "Unknown",
                samplePaths: [],
                detectedIssues: [],
            },
            fixesTable: [],
            timeline: [],
            failuresCount: 0,
            fixesCount: 0,
            commitCount: 0,
            ciStatus: "pending",
            baseScore: 0,
            speedBonus: 0,
            efficiencyPenalty: 0,
            executionTime: 0,
            clonePath: "",
            currentIteration: 0,
            projectConfig: {
                type: "unknown",
                dockerImage: "",
                installCmd: "",
                testCmd: "",
                buildCmd: "",
                hasTests: false,
            },
            testResults: {
                passed: false,
                exitCode: -1,
                stdout: "",
                stderr: "",
                durationMs: 0,
                failedTests: [],
                errorSummary: "",
                executionMethod: "skipped",
            },
            // Enterprise hardening fields
            failureCategory: "",
            failureSummary: "",
            rawStderr: "",
            pushStrategy: "",
            prUrl: "",
            prePatChSnapshot: "",
            previousFailureCategory: "",
        });
        return {
            executionTime: finalState.executionTime,
            ciStatus: finalState.ciStatus,
            failuresCount: finalState.failuresCount,
            fixesCount: finalState.fixesCount,
            commitCount: finalState.commitCount,
            fixesTable: finalState.fixesTable,
            timeline: finalState.timeline,
            baseScore: finalState.baseScore,
            speedBonus: finalState.speedBonus,
            efficiencyPenalty: finalState.efficiencyPenalty,
            repoUrl: finalState.repoUrl,
            generatedBranchName: finalState.generatedBranchName,
            analysisSummary: finalState.analysisSummary,
            testResults: finalState.testResults,
            projectType: finalState.projectConfig.type,
            // Enterprise hardening fields
            failureCategory: finalState.failureCategory || undefined,
            failureSummary: finalState.failureSummary || undefined,
            pushStrategy: finalState.pushStrategy || undefined,
            prUrl: finalState.prUrl || undefined,
        };
    }
    catch (error) {
        const clonePath = activeClonePaths.get(input.runId);
        if (clonePath) {
            await cleanupWorkspace(clonePath).catch(() => undefined);
            activeClonePaths.delete(input.runId);
        }
        throw error;
    }
};
//# sourceMappingURL=graphAgents.js.map