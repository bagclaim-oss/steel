// ─── Orchestrator Types ─────────────────────────────────────────────────────

// ── Config (workflow definition) ────────────────────────────────────────────

export interface OrchestratorStage {
  /** Human-readable stage name */
  name: string;
  /** Prompt sent to the child session for this stage */
  prompt: string;
  /** Override model for this stage (falls back to orchestrator defaultModel) */
  model?: string;
  /** Override permission mode for this stage */
  permissionMode?: string;
  /** Override allowed tools for this stage */
  allowedTools?: string[];
  /** Stage timeout in ms (default: 30 minutes) */
  timeout?: number;
}

export interface OrchestratorConfig {
  /** Unique slug-based ID (derived from name) */
  id: string;
  /** Schema version for forward compat */
  version: 1;
  /** Human-readable name */
  name: string;
  /** Short description of what this orchestrator does */
  description: string;
  /** Emoji or icon identifier */
  icon?: string;
  /** Ordered list of stages to execute */
  stages: OrchestratorStage[];

  // ── Session Config (defaults applied to all stages) ──
  /** "claude" or "codex" */
  backendType: "claude" | "codex";
  /** Default model for stages (e.g. "claude-sonnet-4-6") */
  defaultModel: string;
  /** Default permission mode for stages */
  defaultPermissionMode: string;
  /** Working directory path (target repo) */
  cwd: string;
  /** Required environment slug — references ~/.companion/envs/ */
  envSlug: string;
  /** Extra environment variables */
  env?: Record<string, string>;
  /** Default tool allowlist (empty = all tools) */
  allowedTools?: string[];
  /**
   * Container strategy:
   * - "shared" (default): one container for all stages, stages see each other's changes
   * - "per-stage": fresh container per stage, full isolation between stages
   */
  containerMode?: "shared" | "per-stage";

  // ── Tracking ──
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
  totalRuns: number;
}

/** Input for creating an orchestrator (without auto-generated fields) */
export type OrchestratorConfigCreateInput = Omit<
  OrchestratorConfig,
  "id" | "createdAt" | "updatedAt" | "totalRuns"
>;

// ── Run (single execution of an orchestrator) ───────────────────────────────

export type RunStageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface RunStage {
  /** Stage index (0-based) */
  index: number;
  /** Stage name (copied from config) */
  name: string;
  /** Current status */
  status: RunStageStatus;
  /** Child session ID for this stage */
  sessionId?: string;
  /** When stage execution started */
  startedAt?: number;
  /** When stage execution completed */
  completedAt?: number;
  /** Error message if stage failed */
  error?: string;
  /** Cost in USD for this stage */
  costUsd?: number;
}

export type OrchestratorRunStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface OrchestratorRun {
  /** Unique run ID (UUID) */
  id: string;
  /** ID of the orchestrator that created this run */
  orchestratorId: string;
  /** Orchestrator name (snapshot at run time) */
  orchestratorName: string;
  /** Current run status */
  status: OrchestratorRunStatus;
  /** Stage execution details */
  stages: RunStage[];
  /** Docker container ID (shared mode) or undefined (per-stage mode) */
  containerId?: string;
  /** Docker container name */
  containerName?: string;
  /** Optional input/context provided at run time */
  input?: string;
  /** When the run was created */
  createdAt: number;
  /** When the run actually started executing */
  startedAt?: number;
  /** When the run completed (success, failure, or cancellation) */
  completedAt?: number;
  /** Error message if run failed */
  error?: string;
  /** Total cost across all stages */
  totalCostUsd: number;
}
