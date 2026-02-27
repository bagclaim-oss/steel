// ─── Orchestrator Frontend Types ─────────────────────────────────────────────
// Mirrors the backend types defined in web/server/orchestrator-types.ts

export interface OrchestratorStage {
  name: string;
  prompt: string;
  model?: string;
  permissionMode?: string;
  allowedTools?: string[];
  timeout?: number;
}

export interface OrchestratorConfig {
  id: string;
  version: 1;
  name: string;
  description: string;
  icon?: string;
  stages: OrchestratorStage[];
  backendType: "claude" | "codex";
  defaultModel: string;
  defaultPermissionMode: string;
  cwd: string;
  envSlug: string;
  env?: Record<string, string>;
  allowedTools?: string[];
  containerMode?: "shared" | "per-stage";
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  totalRuns: number;
}

export type RunStageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface RunStage {
  index: number;
  name: string;
  status: RunStageStatus;
  sessionId?: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  costUsd?: number;
}

export type OrchestratorRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface OrchestratorRun {
  id: string;
  orchestratorId: string;
  orchestratorName: string;
  status: OrchestratorRunStatus;
  stages: RunStage[];
  containerId?: string;
  containerName?: string;
  input?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: string;
  totalCostUsd: number;
}
