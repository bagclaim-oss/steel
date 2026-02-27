import { useState, useEffect } from "react";
import { orchestratorApi } from "../orchestrator-api.js";
import type {
  OrchestratorRun,
  RunStage,
  OrchestratorRunStatus,
} from "../orchestrator-types.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(startMs: number, endMs?: number): string {
  const elapsed = (endMs || Date.now()) - startMs;
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

// ─── Status Badge ────────────────────────────────────────────────────────────

const STATUS_BADGE_CLASSES: Record<OrchestratorRunStatus, string> = {
  pending: "bg-gray-500/20 text-gray-400",
  running: "bg-amber-500/20 text-amber-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
  cancelled: "bg-gray-500/20 text-gray-400",
};

function StatusBadge({ status }: { status: OrchestratorRunStatus }) {
  const base = "px-2 py-0.5 text-[10px] font-medium rounded-full inline-flex items-center gap-1";
  const colorClass = STATUS_BADGE_CLASSES[status] || "bg-gray-500/20 text-gray-400";

  return (
    <span className={`${base} ${colorClass}`}>
      {status === "running" && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
        </span>
      )}
      {status}
    </span>
  );
}

// ─── Stage Status Icon ───────────────────────────────────────────────────────

function StageStatusIcon({ status }: { status: RunStage["status"] }) {
  switch (status) {
    case "pending":
      return (
        <div className="w-5 h-5 flex items-center justify-center">
          <div className="w-3 h-3 rounded-full border-2 border-gray-500" />
        </div>
      );
    case "running":
      return (
        <div className="w-5 h-5 flex items-center justify-center">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-400" />
          </span>
        </div>
      );
    case "completed":
      return (
        <div className="w-5 h-5 flex items-center justify-center text-emerald-400">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
          </svg>
        </div>
      );
    case "failed":
      return (
        <div className="w-5 h-5 flex items-center justify-center text-red-400">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </div>
      );
    case "skipped":
      return (
        <div className="w-5 h-5 flex items-center justify-center text-gray-500">
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
            <path d="M4 8a.75.75 0 01.75-.75h6.5a.75.75 0 010 1.5h-6.5A.75.75 0 014 8z" />
          </svg>
        </div>
      );
  }
}

// ─── Stage Row ───────────────────────────────────────────────────────────────

const STAGE_STATUS_CLASSES: Record<RunStage["status"], string> = {
  pending: "bg-gray-500/20 text-gray-400",
  running: "bg-amber-500/20 text-amber-400",
  completed: "bg-emerald-500/20 text-emerald-400",
  failed: "bg-red-500/20 text-red-400",
  skipped: "bg-gray-500/10 text-gray-500",
};

function StageRow({ stage }: { stage: RunStage }) {
  const statusClass = STAGE_STATUS_CLASSES[stage.status] || "bg-gray-500/20 text-gray-400";

  return (
    <div className="flex items-start gap-3 py-3 px-4 rounded-lg bg-cc-card border border-cc-border">
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        <StageStatusIcon status={stage.status} />
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-cc-fg">{stage.name}</span>
          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${statusClass}`}>
            {stage.status}
          </span>
        </div>

        {/* Meta row: duration, cost, session link */}
        <div className="flex items-center gap-3 mt-1 text-xs text-cc-muted">
          {stage.startedAt && (
            <span>{formatDuration(stage.startedAt, stage.completedAt)}</span>
          )}
          {stage.costUsd != null && stage.costUsd > 0 && (
            <span>{formatCost(stage.costUsd)}</span>
          )}
          {stage.sessionId && (
            <a
              href={`#/session/${stage.sessionId}`}
              className="text-cc-primary hover:underline"
            >
              View Session
            </a>
          )}
        </div>

        {/* Error message */}
        {stage.error && (
          <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {stage.error}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function OrchestratorRunView({ runId }: { runId: string }) {
  const [run, setRun] = useState<OrchestratorRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [inputExpanded, setInputExpanded] = useState(false);

  // Fetch the run data initially and poll while active
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function fetchRun() {
      try {
        const data = await orchestratorApi.getRun(runId);
        if (cancelled) return;
        setRun(data);
        setError(null);

        // Continue polling if the run is still active
        if (data.status === "running" || data.status === "pending") {
          timer = setTimeout(fetchRun, 3000);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRun();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  async function handleCancel() {
    setCancelling(true);
    try {
      await orchestratorApi.cancelRun(runId);
      // Re-fetch immediately after cancel
      const data = await orchestratorApi.getRun(runId);
      setRun(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancelling(false);
    }
  }

  // Calculate totals from stage data
  const totalDuration =
    run?.startedAt
      ? formatDuration(run.startedAt, run.completedAt)
      : null;

  const totalCost = run?.totalCostUsd ?? 0;

  // ── Loading state ──
  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-cc-bg">
        <div className="max-w-3xl mx-auto p-6">
          <div className="text-sm text-cc-muted">Loading run...</div>
        </div>
      </div>
    );
  }

  // ── Error state (no run loaded) ──
  if (error && !run) {
    return (
      <div className="h-full overflow-y-auto bg-cc-bg">
        <div className="max-w-3xl mx-auto p-6">
          <a
            href="#/orchestrators"
            className="inline-flex items-center gap-1.5 text-xs text-cc-muted hover:text-cc-fg transition-colors mb-4"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="2" fill="none" />
            </svg>
            Back to Orchestrators
          </a>
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!run) return null;

  return (
    <div className="h-full overflow-y-auto bg-cc-bg">
      <div className="max-w-3xl mx-auto p-6">
        {/* Back link */}
        <a
          href="#/orchestrators"
          className="inline-flex items-center gap-1.5 text-xs text-cc-muted hover:text-cc-fg transition-colors mb-4"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="2" fill="none" />
          </svg>
          Back to Orchestrators
        </a>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <h1 className="text-lg font-semibold text-cc-fg truncate">
              {run.orchestratorName}
            </h1>
            <StatusBadge status={run.status} />
          </div>
          {run.status === "running" && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {cancelling ? "Cancelling..." : "Cancel"}
            </button>
          )}
        </div>

        {/* Error banner (shown when run loaded but a refresh error occurred) */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {error}
          </div>
        )}

        {/* Run-level error */}
        {run.error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
            {run.error}
          </div>
        )}

        {/* Input section */}
        {run.input && (
          <div className="mb-6">
            <button
              onClick={() => setInputExpanded(!inputExpanded)}
              className="flex items-center gap-2 text-xs text-cc-muted cursor-pointer hover:text-cc-fg transition-colors w-full"
            >
              <svg
                viewBox="0 0 16 16"
                fill="currentColor"
                className={`w-3 h-3 transition-transform ${inputExpanded ? "rotate-90" : ""}`}
              >
                <path d="M6 3l5 5-5 5V3z" />
              </svg>
              Input
            </button>
            {inputExpanded && (
              <div className="mt-2 px-3 py-2 rounded-lg bg-cc-card border border-cc-border text-cc-fg text-sm font-mono-code whitespace-pre-wrap break-words">
                {run.input}
              </div>
            )}
          </div>
        )}

        {/* Stage timeline */}
        <div className="mb-6">
          <h2 className="text-xs text-cc-muted mb-3">Stages</h2>
          {run.stages.length === 0 ? (
            <p className="text-xs text-cc-muted">No stages yet.</p>
          ) : (
            <div className="space-y-2">
              {/* Vertical timeline connector */}
              {run.stages.map((stage, index) => (
                <div key={stage.index} className="relative">
                  {/* Connector line between stages */}
                  {index < run.stages.length - 1 && (
                    <div className="absolute left-[26px] top-[calc(100%)] w-0.5 h-2 bg-cc-border" />
                  )}
                  <StageRow stage={stage} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer: totals */}
        {(totalDuration || totalCost > 0) && (
          <div className="pt-4 border-t border-cc-border flex items-center gap-4 text-xs text-cc-muted">
            {totalDuration && (
              <span>
                Total duration: <span className="text-cc-fg font-medium">{totalDuration}</span>
              </span>
            )}
            {totalCost > 0 && (
              <span>
                Total cost: <span className="text-cc-fg font-medium">{formatCost(totalCost)}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
