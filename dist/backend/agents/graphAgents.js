import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { cloneRepository, scanForIssues, cleanupWorkspace, } from "../services/dockerSandbox.js";
import { applyAllPatches } from "../services/patchEngine.js";
import { configureGitIdentity, createBranch, stageAndCommit, pushBranch, } from "../services/gitService.js";
import { generateBranchName } from "../services/branch.js";
import { detectProjectType, executeTests } from "../services/testRunner.js";
import { RunRepository, TestResultRepository, PatchRepository, } from "../persistence/index.js";
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
});
const plannerAgent = async (state) => ({
    generatedBranchName: generateBranchName(state.teamName, state.leaderName),
    ciStatus: "running",
    currentIteration: 0,
});
const analyzerAgent = async (state) => {
    const clonePath = await cloneRepository(state.repoUrl);
    activeClonePaths.set(state.runId, clonePath);
    await configureGitIdentity(clonePath);
    await createBranch(clonePath, state.generatedBranchName);
    // ── Auto-detect project type for real test execution ──
    const projectConfig = await detectProjectType(clonePath);
    console.log(`[analyzer] Detected project type: ${projectConfig.type}, hasTests: ${projectConfig.hasTests}`);
    // ── Run REAL tests / build to establish a baseline ──
    const testResults = await executeTests(clonePath, projectConfig);
    console.log(`[analyzer] Initial test run — passed: ${testResults.passed}, ` +
        `exit: ${testResults.exitCode}, failures: ${testResults.failedTests.length}`);
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
    // ── Persist progress to Postgres ──
    await RunRepository.updateProgress(state.runId, {
        ciStatus,
        projectType: projectConfig.type,
        failuresCount: totalFailures,
        analysisSummary,
    });
    return {
        clonePath,
        projectConfig,
        testResults,
        analysisSummary,
        failuresCount: totalFailures,
        ciStatus,
    };
};
const remediationAgent = async (state) => {
    const issues = Array.isArray(state.analysisSummary.detectedIssues)
        ? state.analysisSummary.detectedIssues
        : [];
    const iteration = state.currentIteration + 1;
    if (issues.length === 0) {
        const timelineEntry = {
            iteration,
            result: "passed",
            timestamp: new Date().toISOString(),
            retryCount: iteration,
            retryLimit: state.retryLimit,
        };
        // Persist empty iteration to Postgres
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
    // ── Apply real patches to the cloned repository files ──
    const patchResults = await applyAllPatches(issues, state.clonePath);
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
    // ── Stage and commit the real file changes ──
    let commitCount = state.commitCount;
    let commitSha;
    if (applied.length > 0) {
        const msg = `[AI-AGENT] fix: apply ${applied.length} automated fixes (iteration ${iteration})`;
        const result = await stageAndCommit(state.clonePath, msg);
        if (result.commitSha) {
            commitSha = result.commitSha;
            commitCount += 1;
            console.log(`[agent] Committed ${result.filesChanged} file(s) — ${result.commitSha.slice(0, 8)}`);
        }
    }
    const timelineEntry = {
        iteration,
        result: failed.length > 0 ? "failed" : "passed",
        timestamp: new Date().toISOString(),
        retryCount: iteration,
        retryLimit: state.retryLimit,
    };
    // ── Persist patches + timeline to Postgres atomically ──
    await PatchRepository.recordIteration(state.runId, iteration, newFixes, timelineEntry, commitSha);
    await RunRepository.updateProgress(state.runId, {
        fixesCount: state.fixesTable.length + applied.length,
        commitCount,
        currentIteration: iteration,
    });
    return {
        fixesTable: [...state.fixesTable, ...newFixes],
        timeline: [...state.timeline, timelineEntry],
        fixesCount: state.fixesTable.length + applied.length,
        commitCount,
        currentIteration: iteration,
    };
};
// ── Verifier: re-run REAL tests and rescan to validate patches ──
const verifierAgent = async (state) => {
    if (state.ciStatus === "passed") {
        return {};
    }
    // ── Run the REAL test suite again to validate whether patches helped ──
    const testResults = await executeTests(state.clonePath, state.projectConfig);
    console.log(`[verifier] Post-patch test run — passed: ${testResults.passed}, ` +
        `exit: ${testResults.exitCode}, failures: ${testResults.failedTests.length}`);
    // ── Persist verification test result to Postgres ──
    await TestResultRepository.create(state.runId, state.currentIteration, 'verification', testResults);
    // ── Also re-run the static scan to track remaining style issues ──
    const freshAnalysis = await scanForIssues(state.clonePath);
    const remaining = freshAnalysis.detectedIssues.length;
    // CI status is driven by REAL test exit code.
    const ciStatus = testResults.passed ? "passed" : "failed";
    const failuresCount = testResults.passed
        ? remaining
        : remaining + Math.max(1, testResults.failedTests.length);
    // ── Persist progress to Postgres ──
    await RunRepository.updateProgress(state.runId, {
        ciStatus,
        failuresCount,
        analysisSummary: freshAnalysis,
    });
    return {
        testResults,
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
    // ── Push the fix branch to GitHub if a token is available ──
    const githubToken = process.env.GITHUB_TOKEN?.trim();
    if (githubToken && state.clonePath && state.commitCount > 0) {
        try {
            await pushBranch(state.clonePath, state.generatedBranchName, state.repoUrl, githubToken);
            console.log(`[agent] Pushed branch "${state.generatedBranchName}" to ${state.repoUrl}`);
        }
        catch (err) {
            console.warn(`[agent] Push skipped: ${err instanceof Error ? err.message : "unknown error"}`);
        }
    }
    else if (!githubToken) {
        console.warn("[agent] GITHUB_TOKEN not set — patches applied locally only, push skipped.");
    }
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