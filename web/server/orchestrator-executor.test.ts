import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Use vi.hoisted so the mock factory can reference tempHome after hoisting
const tempHome = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs");
  const { join } = require("node:path");
  const { tmpdir } = require("node:os");
  return mkdtempSync(join(tmpdir(), "orch-exec-test-"));
});

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => tempHome };
});

// Mock container-manager (synchronous module-level singleton)
vi.mock("./container-manager.js", () => ({
  containerManager: {
    checkDocker: vi.fn().mockReturnValue(true),
    imageExists: vi.fn().mockReturnValue(true),
    createContainer: vi.fn().mockReturnValue({
      containerId: "fake-container-id-abc123",
      name: "companion-fake1234",
      image: "the-companion:latest",
      portMappings: [],
      hostCwd: "/tmp/test",
      containerCwd: "/workspace",
      state: "running",
    }),
    copyWorkspaceToContainer: vi.fn().mockResolvedValue(undefined),
    reseedGitAuth: vi.fn(),
    execInContainerAsync: vi.fn().mockResolvedValue({ exitCode: 0, output: "" }),
    removeContainer: vi.fn(),
  },
}));

// Mock env-manager
vi.mock("./env-manager.js", () => ({
  getEnv: vi.fn().mockReturnValue({
    name: "Test Env",
    slug: "test-env",
    variables: {},
    imageTag: "the-companion:latest",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }),
}));

// Mock session-names
vi.mock("./session-names.js", () => ({
  setName: vi.fn(),
  getName: vi.fn(),
}));

import * as orchestratorStore from "./orchestrator-store.js";
import { OrchestratorExecutor } from "./orchestrator-executor.js";
import type { OrchestratorConfig } from "./orchestrator-types.js";
import { containerManager } from "./container-manager.js";

// ── Mock CliLauncher + WsBridge ─────────────────────────────────────────────

function createMockLauncher() {
  const sessions = new Map<string, { sessionId: string; state: string; exitCode?: number }>();
  let launchCounter = 0;

  return {
    launch: vi.fn((options: Record<string, unknown>) => {
      launchCounter++;
      const sessionId = `mock-session-${launchCounter}`;
      const info = { sessionId, state: "connected", ...options };
      sessions.set(sessionId, info);
      return info;
    }),
    kill: vi.fn(async (sessionId: string) => {
      const session = sessions.get(sessionId);
      if (session) session.state = "exited";
      return true;
    }),
    getSession: vi.fn((sessionId: string) => sessions.get(sessionId) || null),
    isAlive: vi.fn((sessionId: string) => {
      const session = sessions.get(sessionId);
      return !!session && session.state !== "exited";
    }),
    _sessions: sessions,
  };
}

function createMockWsBridge() {
  const resultListeners = new Map<string, Array<(msg: Record<string, unknown>) => void>>();

  return {
    injectUserMessage: vi.fn(),
    onResultMessage: vi.fn((sessionId: string, cb: (msg: Record<string, unknown>) => void) => {
      if (!resultListeners.has(sessionId)) {
        resultListeners.set(sessionId, []);
      }
      resultListeners.get(sessionId)!.push(cb);
      return () => {
        const listeners = resultListeners.get(sessionId);
        if (listeners) {
          const idx = listeners.indexOf(cb);
          if (idx >= 0) listeners.splice(idx, 1);
        }
      };
    }),
    /** Test helper: simulate a result message for a session */
    _fireResult: (sessionId: string, msg: Record<string, unknown>) => {
      const listeners = resultListeners.get(sessionId);
      if (listeners) {
        resultListeners.delete(sessionId);
        for (const cb of listeners) cb(msg);
      }
    },
    _resultListeners: resultListeners,
  };
}

// ── Setup / Teardown ────────────────────────────────────────────────────────

let mockLauncher: ReturnType<typeof createMockLauncher>;
let mockWsBridge: ReturnType<typeof createMockWsBridge>;
let executor: OrchestratorExecutor;

beforeEach(() => {
  mockLauncher = createMockLauncher();
  mockWsBridge = createMockWsBridge();
  executor = new OrchestratorExecutor(
    mockLauncher as unknown as ConstructorParameters<typeof OrchestratorExecutor>[0],
    mockWsBridge as unknown as ConstructorParameters<typeof OrchestratorExecutor>[1],
  );
});

afterEach(() => {
  // Clean up store files
  const orchDir = join(tempHome, ".companion", "orchestrators");
  const runsDir = join(tempHome, ".companion", "orchestrator-runs");
  try { rmSync(orchDir, { recursive: true, force: true }); } catch { /* ok */ }
  try { rmSync(runsDir, { recursive: true, force: true }); } catch { /* ok */ }
  vi.restoreAllMocks();
});

// ── Helper: create a test orchestrator in the store ─────────────────────────

function createTestOrchestrator(overrides?: Partial<OrchestratorConfig>): OrchestratorConfig {
  return orchestratorStore.createOrchestrator({
    version: 1,
    name: overrides?.name || `Test Orch ${Date.now()}`,
    description: "Test orchestrator",
    stages: overrides?.stages || [
      { name: "Stage 1", prompt: "Do thing 1" },
      { name: "Stage 2", prompt: "Do thing 2" },
    ],
    backendType: "claude",
    defaultModel: "claude-sonnet-4-6",
    defaultPermissionMode: "bypassPermissions",
    cwd: "/tmp/test-repo",
    envSlug: "test-env",
    enabled: true,
    ...overrides,
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("OrchestratorExecutor", () => {
  it("should reject non-existent orchestrator", async () => {
    await expect(executor.startRun("non-existent")).rejects.toThrow("not found");
  });

  it("should reject disabled orchestrator", async () => {
    const config = createTestOrchestrator({ enabled: false });
    await expect(executor.startRun(config.id)).rejects.toThrow("disabled");
  });

  it("should reject when Docker is not available", async () => {
    const config = createTestOrchestrator();
    vi.mocked(containerManager.checkDocker).mockReturnValueOnce(false);
    await expect(executor.startRun(config.id)).rejects.toThrow("Docker is not available");
  });

  it("should reject when Docker image is missing", async () => {
    const config = createTestOrchestrator();
    vi.mocked(containerManager.imageExists).mockReturnValueOnce(false);
    await expect(executor.startRun(config.id)).rejects.toThrow("not found locally");
  });

  it("should create a run and return it in pending state", async () => {
    const config = createTestOrchestrator();

    // Don't let stages complete — we just want to check the initial return
    const run = await executor.startRun(config.id);

    expect(run).toBeDefined();
    expect(run.orchestratorId).toBe(config.id);
    expect(run.orchestratorName).toBe(config.name);
    expect(run.status).toBe("pending");
    expect(run.stages).toHaveLength(2);
    expect(run.stages[0].status).toBe("pending");
    expect(run.stages[1].status).toBe("pending");
  });

  it("should execute stages sequentially and complete run", async () => {
    const config = createTestOrchestrator({
      name: "Sequential Test",
      stages: [
        { name: "Build", prompt: "Build the thing" },
        { name: "Test", prompt: "Test the thing" },
      ],
    });

    // Override injectUserMessage to auto-fire result after prompt injection
    mockWsBridge.injectUserMessage.mockImplementation((_sessionId: string) => {
      // Fire the result on next tick to simulate async CLI processing
      setTimeout(() => {
        mockWsBridge._fireResult(_sessionId, {
          type: "result",
          total_cost_usd: 0.05,
          num_turns: 3,
          is_error: false,
        });
      }, 10);
    });

    const run = await executor.startRun(config.id);

    // Wait for async execution to complete
    await waitForRunStatus(run.id, "completed", 5000);

    const completedRun = orchestratorStore.getRun(run.id)!;
    expect(completedRun.status).toBe("completed");
    expect(completedRun.stages[0].status).toBe("completed");
    expect(completedRun.stages[1].status).toBe("completed");
    expect(completedRun.totalCostUsd).toBeCloseTo(0.10, 2);
    expect(completedRun.completedAt).toBeGreaterThan(0);

    // Should have launched 2 sessions (one per stage)
    expect(mockLauncher.launch).toHaveBeenCalledTimes(2);
    // Should have injected 2 prompts
    expect(mockWsBridge.injectUserMessage).toHaveBeenCalledTimes(2);

    // Verify prompt contents include stage info
    const firstPrompt = mockWsBridge.injectUserMessage.mock.calls[0][1] as string;
    expect(firstPrompt).toContain("Stage 1/2: Build");
    expect(firstPrompt).toContain("Build the thing");
  });

  it("should stop execution on stage failure and skip remaining stages", async () => {
    const config = createTestOrchestrator({
      name: "Fail Test",
      stages: [
        { name: "Fail Stage", prompt: "This will fail" },
        { name: "Skip Stage", prompt: "This should be skipped" },
      ],
    });

    // First stage fails
    mockWsBridge.injectUserMessage.mockImplementation((_sessionId: string) => {
      setTimeout(() => {
        mockWsBridge._fireResult(_sessionId, {
          type: "result",
          total_cost_usd: 0.02,
          num_turns: 1,
          is_error: true,
          error: "Something went wrong",
        });
      }, 10);
    });

    const run = await executor.startRun(config.id);
    await waitForRunStatus(run.id, "failed", 5000);

    const failedRun = orchestratorStore.getRun(run.id)!;
    expect(failedRun.status).toBe("failed");
    expect(failedRun.stages[0].status).toBe("failed");
    expect(failedRun.stages[1].status).toBe("skipped");
    // Only one session launched (second stage was skipped)
    expect(mockLauncher.launch).toHaveBeenCalledTimes(1);
  });

  it("should cancel an active run", async () => {
    const config = createTestOrchestrator({ name: "Cancel Test" });

    // Don't auto-fire results — let the stage hang so we can cancel
    const run = await executor.startRun(config.id);

    // Wait for the executor to reach the waitForResult phase.
    // waitForCLIConnection polls every 500ms, so wait enough for it to pass.
    await new Promise((r) => setTimeout(r, 1000));

    await executor.cancelRun(run.id);

    // Fire result to unblock the pending waitForResult (simulates the kill causing a result)
    const sessionId = mockLauncher.launch.mock.results[0]?.value?.sessionId;
    if (sessionId) {
      mockWsBridge._fireResult(sessionId, {
        type: "result",
        total_cost_usd: 0,
        num_turns: 0,
        is_error: true,
      });
    }

    await waitForRunStatus(run.id, "cancelled", 5000);

    const cancelledRun = orchestratorStore.getRun(run.id)!;
    expect(cancelledRun.status).toBe("cancelled");
  }, 10000);

  it("should include input context in stage prompts", async () => {
    const config = createTestOrchestrator({
      name: "Input Test",
      stages: [{ name: "Stage", prompt: "Do work" }],
    });

    mockWsBridge.injectUserMessage.mockImplementation((_sessionId: string) => {
      setTimeout(() => {
        mockWsBridge._fireResult(_sessionId, {
          type: "result",
          total_cost_usd: 0.01,
          num_turns: 1,
          is_error: false,
        });
      }, 10);
    });

    const run = await executor.startRun(config.id, "Build the login feature");
    await waitForRunStatus(run.id, "completed", 5000);

    const prompt = mockWsBridge.injectUserMessage.mock.calls[0][1] as string;
    expect(prompt).toContain("Build the login feature");
    expect(prompt).toContain("--- Context ---");
  });

  it("should pass container info to launcher", async () => {
    const config = createTestOrchestrator({
      name: "Container Test",
      stages: [{ name: "Stage", prompt: "Test" }],
    });

    mockWsBridge.injectUserMessage.mockImplementation((_sessionId: string) => {
      setTimeout(() => {
        mockWsBridge._fireResult(_sessionId, {
          type: "result",
          total_cost_usd: 0,
          num_turns: 1,
          is_error: false,
        });
      }, 10);
    });

    await executor.startRun(config.id);
    await new Promise((r) => setTimeout(r, 200));

    // Verify launch was called with container options
    const launchCall = mockLauncher.launch.mock.calls[0][0];
    expect(launchCall.containerId).toBe("fake-container-id-abc123");
    expect(launchCall.containerName).toBe("companion-fake1234");
    expect(launchCall.containerCwd).toBe("/workspace");
  });

  it("should increment totalRuns on the orchestrator config", async () => {
    const config = createTestOrchestrator({
      name: "Count Test",
      stages: [{ name: "Stage", prompt: "Test" }],
    });

    mockWsBridge.injectUserMessage.mockImplementation((_sessionId: string) => {
      setTimeout(() => {
        mockWsBridge._fireResult(_sessionId, {
          type: "result",
          total_cost_usd: 0,
          num_turns: 1,
          is_error: false,
        });
      }, 10);
    });

    await executor.startRun(config.id);
    await waitForRunStatus(orchestratorStore.listRuns()[0]?.id || "", "completed", 5000);

    const updated = orchestratorStore.getOrchestrator(config.id)!;
    expect(updated.totalRuns).toBe(1);
  });
});

// ── Test Utility ────────────────────────────────────────────────────────────

/** Poll run status until it matches expected value or timeout. */
async function waitForRunStatus(
  runId: string,
  expectedStatus: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const run = orchestratorStore.getRun(runId);
    if (run && run.status === expectedStatus) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  const run = orchestratorStore.getRun(runId);
  throw new Error(
    `Run ${runId} did not reach status "${expectedStatus}" within ${timeoutMs}ms (current: ${run?.status || "not found"})`,
  );
}
