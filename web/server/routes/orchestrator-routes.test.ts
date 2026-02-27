import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Hono } from "hono";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Use vi.hoisted so the mock factory can reference tempHome after hoisting
const tempHome = vi.hoisted(() => {
  const { mkdtempSync } = require("node:fs");
  const { join } = require("node:path");
  const { tmpdir } = require("node:os");
  return mkdtempSync(join(tmpdir(), "orch-routes-test-"));
});

vi.mock("node:os", async () => {
  const actual = await vi.importActual<typeof import("node:os")>("node:os");
  return { ...actual, homedir: () => tempHome };
});

// Mock container-manager (module-level singleton)
vi.mock("../container-manager.js", () => ({
  containerManager: {
    removeContainer: vi.fn(),
  },
}));

import { registerOrchestratorRoutes } from "./orchestrator-routes.js";
import * as orchestratorStore from "../orchestrator-store.js";

// ── Mock OrchestratorExecutor ───────────────────────────────────────────────

const mockExecutor = {
  startRun: vi.fn(),
  cancelRun: vi.fn(),
  getRun: vi.fn(),
  getActiveRuns: vi.fn().mockReturnValue([]),
};

// ── Setup ───────────────────────────────────────────────────────────────────

let app: Hono;

beforeEach(() => {
  app = new Hono();
  registerOrchestratorRoutes(app, mockExecutor as any);
  vi.clearAllMocks();
});

afterEach(() => {
  const orchDir = join(tempHome, ".companion", "orchestrators");
  const runsDir = join(tempHome, ".companion", "orchestrator-runs");
  try { rmSync(orchDir, { recursive: true, force: true }); } catch { /* ok */ }
  try { rmSync(runsDir, { recursive: true, force: true }); } catch { /* ok */ }
});

// ── Helper ──────────────────────────────────────────────────────────────────

async function req(method: string, path: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return app.request(path, init);
}

// ── Tests: Orchestrator CRUD ────────────────────────────────────────────────

describe("orchestrator-routes: CRUD", () => {
  it("GET /orchestrators returns empty list initially", async () => {
    const res = await req("GET", "/orchestrators");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual([]);
  });

  it("POST /orchestrators creates an orchestrator", async () => {
    const res = await req("POST", "/orchestrators", {
      name: "My Workflow",
      description: "A test workflow",
      stages: [{ name: "Build", prompt: "Build it" }],
      backendType: "claude",
      defaultModel: "claude-sonnet-4-6",
      defaultPermissionMode: "bypassPermissions",
      cwd: "/tmp/repo",
      envSlug: "test-env",
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe("my-workflow");
    expect(data.name).toBe("My Workflow");
    expect(data.stages).toHaveLength(1);
  });

  it("POST /orchestrators rejects missing name", async () => {
    const res = await req("POST", "/orchestrators", {
      stages: [{ name: "Build", prompt: "Build it" }],
      envSlug: "test-env",
    });
    expect(res.status).toBe(400);
  });

  it("POST /orchestrators rejects empty stages", async () => {
    const res = await req("POST", "/orchestrators", {
      name: "Empty Stages",
      stages: [],
      envSlug: "test-env",
    });
    expect(res.status).toBe(400);
  });

  it("POST /orchestrators rejects missing envSlug", async () => {
    const res = await req("POST", "/orchestrators", {
      name: "No Env",
      stages: [{ name: "Build", prompt: "Build it" }],
    });
    expect(res.status).toBe(400);
  });

  it("GET /orchestrators/:id returns specific orchestrator", async () => {
    await req("POST", "/orchestrators", {
      name: "Fetch Test",
      stages: [{ name: "S1", prompt: "P1" }],
      envSlug: "test-env",
    });

    const res = await req("GET", "/orchestrators/fetch-test");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.name).toBe("Fetch Test");
  });

  it("GET /orchestrators/:id returns 404 for non-existent", async () => {
    const res = await req("GET", "/orchestrators/nope");
    expect(res.status).toBe(404);
  });

  it("PUT /orchestrators/:id updates an orchestrator", async () => {
    await req("POST", "/orchestrators", {
      name: "Update Test",
      stages: [{ name: "S1", prompt: "P1" }],
      envSlug: "test-env",
    });

    const res = await req("PUT", "/orchestrators/update-test", {
      description: "Updated description",
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.description).toBe("Updated description");
  });

  it("DELETE /orchestrators/:id deletes an orchestrator", async () => {
    await req("POST", "/orchestrators", {
      name: "Delete Test",
      stages: [{ name: "S1", prompt: "P1" }],
      envSlug: "test-env",
    });

    const res = await req("DELETE", "/orchestrators/delete-test");
    expect(res.status).toBe(200);

    const check = await req("GET", "/orchestrators/delete-test");
    expect(check.status).toBe(404);
  });

  it("DELETE /orchestrators/:id returns 404 for non-existent", async () => {
    const res = await req("DELETE", "/orchestrators/nope");
    expect(res.status).toBe(404);
  });
});

// ── Tests: Run Management ───────────────────────────────────────────────────

describe("orchestrator-routes: run management", () => {
  it("POST /orchestrators/:id/run starts a run", async () => {
    orchestratorStore.createOrchestrator({
      version: 1,
      name: "Run Test",
      description: "A test orchestrator",
      stages: [{ name: "S1", prompt: "P1" }],
      backendType: "claude",
      defaultModel: "claude-sonnet-4-6",
      defaultPermissionMode: "bypassPermissions",
      cwd: "/tmp/repo",
      envSlug: "test-env",
      enabled: true,
    });

    const mockRun = {
      id: "run-123",
      orchestratorId: "run-test",
      status: "pending",
      stages: [],
      createdAt: Date.now(),
      totalCostUsd: 0,
    };
    mockExecutor.startRun.mockResolvedValueOnce(mockRun);

    const res = await req("POST", "/orchestrators/run-test/run", { input: "test input" });
    expect(res.status).toBe(201);
    expect(mockExecutor.startRun).toHaveBeenCalledWith("run-test", "test input");
  });

  it("POST /orchestrators/:id/run returns 404 for non-existent orchestrator", async () => {
    const res = await req("POST", "/orchestrators/nope/run");
    expect(res.status).toBe(404);
  });

  it("GET /orchestrators/:id/runs lists runs for an orchestrator", async () => {
    // Create a run directly in store
    orchestratorStore.createRun({
      id: "run-a",
      orchestratorId: "test-orch",
      orchestratorName: "Test",
      status: "completed",
      stages: [],
      createdAt: Date.now(),
      totalCostUsd: 0,
    });

    const res = await req("GET", "/orchestrators/test-orch/runs");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("run-a");
  });

  it("GET /orchestrator-runs lists all runs", async () => {
    orchestratorStore.createRun({
      id: "run-1",
      orchestratorId: "orch-1",
      orchestratorName: "Test",
      status: "completed",
      stages: [],
      createdAt: Date.now(),
      totalCostUsd: 0,
    });
    orchestratorStore.createRun({
      id: "run-2",
      orchestratorId: "orch-2",
      orchestratorName: "Test 2",
      status: "running",
      stages: [],
      createdAt: Date.now(),
      totalCostUsd: 0,
    });

    const res = await req("GET", "/orchestrator-runs");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(2);
  });

  it("GET /orchestrator-runs?status=running filters by status", async () => {
    orchestratorStore.createRun({
      id: "run-1",
      orchestratorId: "orch-1",
      orchestratorName: "Test",
      status: "completed",
      stages: [],
      createdAt: Date.now(),
      totalCostUsd: 0,
    });
    orchestratorStore.createRun({
      id: "run-2",
      orchestratorId: "orch-2",
      orchestratorName: "Test 2",
      status: "running",
      stages: [],
      createdAt: Date.now(),
      totalCostUsd: 0,
    });

    const res = await req("GET", "/orchestrator-runs?status=running");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe("running");
  });

  it("GET /orchestrator-runs/:runId returns a specific run", async () => {
    orchestratorStore.createRun({
      id: "run-xyz",
      orchestratorId: "orch-1",
      orchestratorName: "Test",
      status: "completed",
      stages: [],
      createdAt: Date.now(),
      totalCostUsd: 0.15,
    });

    const res = await req("GET", "/orchestrator-runs/run-xyz");
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe("run-xyz");
    expect(data.totalCostUsd).toBe(0.15);
  });

  it("GET /orchestrator-runs/:runId returns 404 for non-existent", async () => {
    const res = await req("GET", "/orchestrator-runs/nope");
    expect(res.status).toBe(404);
  });

  it("POST /orchestrator-runs/:runId/cancel cancels a run", async () => {
    mockExecutor.cancelRun.mockResolvedValueOnce(undefined);

    const res = await req("POST", "/orchestrator-runs/run-123/cancel");
    expect(res.status).toBe(200);
    expect(mockExecutor.cancelRun).toHaveBeenCalledWith("run-123");
  });

  it("DELETE /orchestrator-runs/:runId deletes a run", async () => {
    orchestratorStore.createRun({
      id: "run-del",
      orchestratorId: "orch-1",
      orchestratorName: "Test",
      status: "completed",
      stages: [],
      createdAt: Date.now(),
      totalCostUsd: 0,
    });

    const res = await req("DELETE", "/orchestrator-runs/run-del");
    expect(res.status).toBe(200);

    const check = await req("GET", "/orchestrator-runs/run-del");
    expect(check.status).toBe(404);
  });
});
