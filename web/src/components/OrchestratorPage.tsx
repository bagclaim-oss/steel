import { useState, useEffect, useCallback } from "react";
import { orchestratorApi } from "../orchestrator-api.js";
import type { OrchestratorConfig, OrchestratorRun } from "../orchestrator-types.js";
import type { Route } from "../utils/routing.js";
import { timeAgo } from "../utils/time-ago.js";

// ─── Types ──────────────────────────────────────────────────────────────────

interface StageFormEntry {
  name: string;
  prompt: string;
}

interface OrchestratorFormData {
  name: string;
  description: string;
  backendType: "claude" | "codex";
  defaultModel: string;
  defaultPermissionMode: string;
  cwd: string;
  envSlug: string;
  containerMode: "shared" | "per-stage";
  stages: StageFormEntry[];
  enabled: boolean;
}

const EMPTY_FORM: OrchestratorFormData = {
  name: "",
  description: "",
  backendType: "claude",
  defaultModel: "sonnet",
  defaultPermissionMode: "default",
  cwd: "",
  envSlug: "",
  containerMode: "shared",
  stages: [{ name: "Stage 1", prompt: "" }],
  enabled: true,
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "bg-green-500/15 text-green-400";
    case "running":
      return "bg-blue-500/15 text-blue-400";
    case "failed":
      return "bg-red-500/15 text-red-400";
    case "cancelled":
      return "bg-yellow-500/15 text-yellow-400";
    case "pending":
    default:
      return "bg-cc-muted/15 text-cc-muted";
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function OrchestratorPage({ route }: { route: Route }) {
  const [orchestrators, setOrchestrators] = useState<OrchestratorConfig[]>([]);
  const [runs, setRuns] = useState<OrchestratorRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"list" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<OrchestratorFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [runInputOrchestrator, setRunInputOrchestrator] = useState<OrchestratorConfig | null>(null);
  const [runInput, setRunInput] = useState("");

  // Load orchestrators and recent runs
  const loadData = useCallback(async () => {
    try {
      const [orchList, runList] = await Promise.all([
        orchestratorApi.list(),
        orchestratorApi.listAllRuns(),
      ]);
      setOrchestrators(orchList);
      setRuns(runList);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load + polling every 5s
  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // ── Form helpers ──

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setView("edit");
  }

  function startEdit(orchestrator: OrchestratorConfig) {
    setEditingId(orchestrator.id);
    setForm({
      name: orchestrator.name,
      description: orchestrator.description,
      backendType: orchestrator.backendType,
      defaultModel: orchestrator.defaultModel,
      defaultPermissionMode: orchestrator.defaultPermissionMode,
      cwd: orchestrator.cwd,
      envSlug: orchestrator.envSlug || "",
      containerMode: orchestrator.containerMode || "shared",
      stages: orchestrator.stages.map((s) => ({ name: s.name, prompt: s.prompt })),
      enabled: orchestrator.enabled,
    });
    setError("");
    setView("edit");
  }

  function cancelEdit() {
    setView("list");
    setEditingId(null);
    setError("");
    window.location.hash = "#/orchestrators";
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const data: Partial<OrchestratorConfig> = {
        version: 1,
        name: form.name,
        description: form.description,
        backendType: form.backendType,
        defaultModel: form.defaultModel,
        defaultPermissionMode: form.defaultPermissionMode,
        cwd: form.cwd || "temp",
        envSlug: form.envSlug || "",
        containerMode: form.containerMode,
        stages: form.stages.map((s) => ({ name: s.name, prompt: s.prompt })),
        enabled: form.enabled,
      };

      if (editingId) {
        await orchestratorApi.update(editingId, data);
      } else {
        await orchestratorApi.create(data);
      }

      await loadData();
      setView("list");
      setEditingId(null);
      window.location.hash = "#/orchestrators";
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this orchestrator?")) return;
    try {
      await orchestratorApi.delete(id);
      await loadData();
    } catch {
      // ignore
    }
  }

  async function handleToggle(id: string) {
    const orch = orchestrators.find((o) => o.id === id);
    if (!orch) return;
    try {
      await orchestratorApi.update(id, { enabled: !orch.enabled });
      await loadData();
    } catch {
      // ignore
    }
  }

  async function handleRun(orchestrator: OrchestratorConfig, input?: string) {
    try {
      await orchestratorApi.startRun(orchestrator.id, input);
      setRunInputOrchestrator(null);
      setRunInput("");
      await loadData();
    } catch {
      // ignore
    }
  }

  function handleRunClick(orchestrator: OrchestratorConfig) {
    // Always show dialog so user can optionally provide input
    setRunInputOrchestrator(orchestrator);
    setRunInput("");
  }

  // ── Render ──

  if (view === "edit") {
    return (
      <OrchestratorEditor
        form={form}
        setForm={setForm}
        editingId={editingId}
        error={error}
        saving={saving}
        onSave={handleSave}
        onCancel={cancelEdit}
      />
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-cc-bg">
      <div className="max-w-4xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-cc-fg">Orchestrators</h1>
            <p className="text-xs text-cc-muted mt-0.5">
              Multi-stage pipelines. Chain multiple Claude/Codex sessions sequentially.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={startCreate}
              className="px-3 py-1.5 text-xs rounded-lg bg-cc-primary text-white hover:bg-cc-primary-hover transition-colors cursor-pointer"
            >
              + New Orchestrator
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-cc-error/10 border border-cc-error/30 text-cc-error text-xs">
            {error}
          </div>
        )}

        {/* Orchestrator Cards */}
        {loading ? (
          <div className="text-sm text-cc-muted">Loading...</div>
        ) : orchestrators.length === 0 ? (
          <div className="text-center py-16">
            <div className="mb-3 flex justify-center text-cc-muted">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                <path d="M4 4h6v6H4zM14 4h6v6h-6zM9 14h6v6H9z" />
                <path d="M7 10v4h2M17 10v1a2 2 0 01-2 2h-2" />
              </svg>
            </div>
            <p className="text-sm text-cc-muted">No orchestrators yet</p>
            <p className="text-xs text-cc-muted mt-1">
              Create an orchestrator to chain multiple sessions into a pipeline.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {orchestrators.map((orch) => (
              <OrchestratorCard
                key={orch.id}
                orchestrator={orch}
                onEdit={() => startEdit(orch)}
                onDelete={() => handleDelete(orch.id)}
                onToggle={() => handleToggle(orch.id)}
                onRun={() => handleRunClick(orch)}
              />
            ))}
          </div>
        )}

        {/* Recent Runs */}
        {runs.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-medium text-cc-fg mb-3">Recent Runs</h2>
            <div className="space-y-2">
              {runs
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 20)
                .map((run) => (
                  <a
                    key={run.id}
                    href={`#/orchestrator-run/${run.id}`}
                    className="flex items-center justify-between rounded-lg border border-cc-border bg-cc-card p-3 hover:border-cc-primary/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${statusColor(run.status)}`}>
                        {run.status}
                      </span>
                      <span className="text-xs text-cc-fg truncate">{run.orchestratorName}</span>
                      {run.input && (
                        <span className="text-[10px] text-cc-muted truncate max-w-[200px]">
                          — {run.input}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-cc-muted flex-shrink-0 ml-3">
                      <span>
                        {run.stages.filter((s) => s.status === "completed").length}/{run.stages.length} stages
                      </span>
                      {run.totalCostUsd > 0 && (
                        <span>${run.totalCostUsd.toFixed(4)}</span>
                      )}
                      <span>{timeAgo(run.createdAt)}</span>
                    </div>
                  </a>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Run Input Modal */}
      {runInputOrchestrator && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setRunInputOrchestrator(null)}
        >
          <div
            className="bg-cc-card rounded-[14px] shadow-2xl p-6 w-full max-w-lg border border-cc-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-medium text-cc-fg mb-1">
              Run {runInputOrchestrator.name}
            </h3>
            <p className="text-xs text-cc-muted mb-3">
              Optionally provide input text for this orchestrator run.
            </p>
            <textarea
              value={runInput}
              onChange={(e) => setRunInput(e.target.value)}
              placeholder="Enter optional input..."
              className="w-full px-3 py-2 rounded-lg bg-cc-input-bg border border-cc-border text-cc-fg text-sm resize-none h-24 focus:outline-none focus:ring-1 focus:ring-cc-primary"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => setRunInputOrchestrator(null)}
                className="px-3 py-1.5 text-xs rounded-lg border border-cc-border text-cc-muted hover:text-cc-fg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRun(runInputOrchestrator, runInput || undefined)}
                className="px-3 py-1.5 text-xs rounded-lg bg-cc-primary text-white hover:bg-cc-primary-hover transition-colors cursor-pointer"
              >
                Run
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Orchestrator Card ──────────────────────────────────────────────────────

function OrchestratorCard({
  orchestrator,
  onEdit,
  onDelete,
  onToggle,
  onRun,
}: {
  orchestrator: OrchestratorConfig;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  onRun: () => void;
}) {
  return (
    <div className="rounded-xl border border-cc-border bg-cc-card p-4 hover:border-cc-primary/30 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 text-cc-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M4 4h6v6H4zM14 4h6v6h-6zM9 14h6v6H9z" />
              <path d="M7 10v4h2M17 10v1a2 2 0 01-2 2h-2" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-cc-fg truncate">{orchestrator.name}</h3>
              <span
                className={`px-1.5 py-0.5 text-[10px] rounded-full font-medium ${
                  orchestrator.enabled
                    ? "bg-cc-success/15 text-cc-success"
                    : "bg-cc-muted/15 text-cc-muted"
                }`}
              >
                {orchestrator.enabled ? "Enabled" : "Disabled"}
              </span>
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-cc-hover text-cc-muted">
                {orchestrator.backendType === "codex" ? "Codex" : "Claude"}
              </span>
            </div>
            {orchestrator.description && (
              <p className="text-xs text-cc-muted mt-0.5 truncate">{orchestrator.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0 ml-3">
          <button
            onClick={onRun}
            className="px-2.5 py-1 text-xs rounded-lg bg-cc-primary text-white hover:bg-cc-primary-hover transition-colors cursor-pointer"
            title="Run orchestrator"
          >
            Run
          </button>
          <button
            onClick={onEdit}
            className="p-1.5 rounded-lg text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
            title="Edit"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M11.013 1.427a1.75 1.75 0 012.474 0l1.086 1.086a1.75 1.75 0 010 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 01-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61z" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
            title={orchestrator.enabled ? "Disable" : "Enable"}
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              {orchestrator.enabled ? (
                <path d="M5 3a5 5 0 000 10h6a5 5 0 000-10H5zm6 3a2 2 0 110 4 2 2 0 010-4z" />
              ) : (
                <path d="M11 3a5 5 0 010 10H5A5 5 0 015 3h6zM5 6a2 2 0 100 4 2 2 0 000-4z" />
              )}
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg text-cc-muted hover:text-cc-error hover:bg-cc-error/10 transition-colors cursor-pointer"
            title="Delete"
          >
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M5.5 5.5a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm-7-3A1.5 1.5 0 015 1h6a1.5 1.5 0 011.5 1.5H14a.5.5 0 010 1h-.554L12.2 14.118A1.5 1.5 0 0110.706 15H5.294a1.5 1.5 0 01-1.494-.882L2.554 3.5H2a.5.5 0 010-1h1.5z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stage count + stats */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-cc-border/50">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="px-2 py-0.5 text-[10px] rounded-full bg-cc-hover text-cc-muted">
            {orchestrator.stages.length} stage{orchestrator.stages.length !== 1 ? "s" : ""}
          </span>
          {orchestrator.envSlug && (
            <span className="px-2 py-0.5 text-[10px] rounded-full bg-cc-hover text-cc-muted">
              env: {orchestrator.envSlug}
            </span>
          )}
          <span className="px-2 py-0.5 text-[10px] rounded-full bg-cc-hover text-cc-muted">
            {orchestrator.containerMode === "per-stage" ? "per-stage" : "shared"}
          </span>
          <a
            href={`#/orchestrators`}
            onClick={(e) => {
              e.preventDefault();
              // Scroll to runs section — for now this is on the same page
              const el = document.getElementById("recent-runs");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-2 py-0.5 text-[10px] rounded-full bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors cursor-pointer"
          >
            View Runs
          </a>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-cc-muted">
          {orchestrator.totalRuns > 0 && (
            <span>
              {orchestrator.totalRuns} run{orchestrator.totalRuns !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Orchestrator Editor ────────────────────────────────────────────────────

function OrchestratorEditor({
  form,
  setForm,
  editingId,
  error,
  saving,
  onSave,
  onCancel,
}: {
  form: OrchestratorFormData;
  setForm: (f: OrchestratorFormData | ((prev: OrchestratorFormData) => OrchestratorFormData)) => void;
  editingId: string | null;
  error: string;
  saving: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  function updateField<K extends keyof OrchestratorFormData>(key: K, value: OrchestratorFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Stage helpers ──

  function addStage() {
    setForm((prev) => ({
      ...prev,
      stages: [...prev.stages, { name: `Stage ${prev.stages.length + 1}`, prompt: "" }],
    }));
  }

  function removeStage(index: number) {
    setForm((prev) => ({
      ...prev,
      stages: prev.stages.filter((_, i) => i !== index),
    }));
  }

  function updateStage(index: number, field: "name" | "prompt", value: string) {
    setForm((prev) => {
      const updated = [...prev.stages];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, stages: updated };
    });
  }

  function moveStage(index: number, direction: "up" | "down") {
    setForm((prev) => {
      const stages = [...prev.stages];
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= stages.length) return prev;
      const temp = stages[index];
      stages[index] = stages[targetIndex];
      stages[targetIndex] = temp;
      return { ...prev, stages };
    });
  }

  return (
    <div className="h-full overflow-y-auto bg-cc-bg">
      <div className="max-w-3xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={onCancel}
              className="p-1.5 rounded-lg text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="2" fill="none" />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-cc-fg">
              {editingId ? "Edit Orchestrator" : "New Orchestrator"}
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-xs rounded-lg border border-cc-border text-cc-muted hover:text-cc-fg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving || !form.name.trim() || form.stages.length === 0}
              className="px-3 py-1.5 text-xs rounded-lg bg-cc-primary text-white hover:bg-cc-primary-hover transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : editingId ? "Save" : "Create"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-cc-error/10 border border-cc-error/30 text-cc-error text-xs">
            {error}
          </div>
        )}

        <div className="space-y-5">
          {/* ── Identity ── */}
          <div className="space-y-2">
            <input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Orchestrator name *"
              className="w-full px-3 py-2 rounded-lg bg-cc-input-bg border border-cc-border text-cc-fg text-sm focus:outline-none focus:ring-1 focus:ring-cc-primary"
            />
            <input
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              placeholder="Short description (optional)"
              className="w-full px-3 py-1.5 rounded-lg bg-cc-input-bg border border-cc-border text-cc-fg text-xs focus:outline-none focus:ring-1 focus:ring-cc-primary"
            />
          </div>

          {/* ── Configuration Row ── */}
          <div className="grid grid-cols-2 gap-3">
            {/* Backend type */}
            <div>
              <label className="block text-[10px] text-cc-muted mb-1">Backend</label>
              <div className="flex items-center bg-cc-hover/50 rounded-lg p-0.5">
                <button
                  onClick={() => updateField("backendType", "claude")}
                  className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                    form.backendType === "claude"
                      ? "bg-cc-card text-cc-fg font-medium shadow-sm"
                      : "text-cc-muted hover:text-cc-fg"
                  }`}
                >
                  Claude
                </button>
                <button
                  onClick={() => updateField("backendType", "codex")}
                  className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                    form.backendType === "codex"
                      ? "bg-cc-card text-cc-fg font-medium shadow-sm"
                      : "text-cc-muted hover:text-cc-fg"
                  }`}
                >
                  Codex
                </button>
              </div>
            </div>

            {/* Container mode */}
            <div>
              <label className="block text-[10px] text-cc-muted mb-1">Container Mode</label>
              <div className="flex items-center bg-cc-hover/50 rounded-lg p-0.5">
                <button
                  onClick={() => updateField("containerMode", "shared")}
                  className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                    form.containerMode === "shared"
                      ? "bg-cc-card text-cc-fg font-medium shadow-sm"
                      : "text-cc-muted hover:text-cc-fg"
                  }`}
                >
                  Shared
                </button>
                <button
                  onClick={() => updateField("containerMode", "per-stage")}
                  className={`flex-1 px-2 py-1 text-xs rounded-md transition-colors cursor-pointer ${
                    form.containerMode === "per-stage"
                      ? "bg-cc-card text-cc-fg font-medium shadow-sm"
                      : "text-cc-muted hover:text-cc-fg"
                  }`}
                >
                  Per-stage
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Default model */}
            <div>
              <label className="block text-[10px] text-cc-muted mb-1">Default Model</label>
              <input
                value={form.defaultModel}
                onChange={(e) => updateField("defaultModel", e.target.value)}
                placeholder="e.g. sonnet, opus, gpt-4o"
                className="w-full px-3 py-2 rounded-lg bg-cc-input-bg border border-cc-border text-cc-fg text-sm font-mono-code focus:outline-none focus:ring-1 focus:ring-cc-primary"
              />
            </div>

            {/* Default permission mode */}
            <div>
              <label className="block text-[10px] text-cc-muted mb-1">Default Permission Mode</label>
              <input
                value={form.defaultPermissionMode}
                onChange={(e) => updateField("defaultPermissionMode", e.target.value)}
                placeholder="e.g. default, plan, auto-edit"
                className="w-full px-3 py-2 rounded-lg bg-cc-input-bg border border-cc-border text-cc-fg text-sm font-mono-code focus:outline-none focus:ring-1 focus:ring-cc-primary"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* CWD */}
            <div>
              <label className="block text-[10px] text-cc-muted mb-1">Working Directory</label>
              <input
                value={form.cwd}
                onChange={(e) => updateField("cwd", e.target.value)}
                placeholder="/path/to/project (or leave empty for temp)"
                className="w-full px-3 py-2 rounded-lg bg-cc-input-bg border border-cc-border text-cc-fg text-sm font-mono-code focus:outline-none focus:ring-1 focus:ring-cc-primary"
              />
            </div>

            {/* envSlug */}
            <div>
              <label className="block text-[10px] text-cc-muted mb-1">Environment Profile</label>
              <input
                value={form.envSlug}
                onChange={(e) => updateField("envSlug", e.target.value)}
                placeholder="env slug (optional)"
                className="w-full px-3 py-2 rounded-lg bg-cc-input-bg border border-cc-border text-cc-fg text-sm font-mono-code focus:outline-none focus:ring-1 focus:ring-cc-primary"
              />
            </div>
          </div>

          {/* ── Stages Builder ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium text-cc-fg">
                Stages ({form.stages.length})
              </h2>
              <button
                onClick={addStage}
                className="text-[10px] text-cc-muted hover:text-cc-fg transition-colors cursor-pointer"
              >
                + Add Stage
              </button>
            </div>

            {form.stages.length === 0 && (
              <p className="text-[10px] text-cc-muted">
                Add at least one stage to create an orchestrator.
              </p>
            )}

            <div className="space-y-3">
              {form.stages.map((stage, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-cc-border bg-cc-card p-3 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-cc-muted font-medium">
                        #{index + 1}
                      </span>
                      <input
                        value={stage.name}
                        onChange={(e) => updateStage(index, "name", e.target.value)}
                        placeholder="Stage name"
                        className="px-2 py-1 rounded-md bg-cc-input-bg border border-cc-border text-cc-fg text-xs focus:outline-none focus:ring-1 focus:ring-cc-primary"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => moveStage(index, "up")}
                        disabled={index === 0}
                        className="p-1 rounded text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move up"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M8 4l4 4H4l4-4z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => moveStage(index, "down")}
                        disabled={index === form.stages.length - 1}
                        className="p-1 rounded text-cc-muted hover:text-cc-fg hover:bg-cc-hover transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Move down"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M8 12l4-4H4l4 4z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => removeStage(index)}
                        disabled={form.stages.length <= 1}
                        className="p-1 rounded text-cc-muted hover:text-cc-error hover:bg-cc-error/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Remove stage"
                      >
                        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                          <path d="M4.646 4.646a.5.5 0 01.708 0L8 7.293l2.646-2.647a.5.5 0 01.708.708L8.707 8l2.647 2.646a.5.5 0 01-.708.708L8 8.707l-2.646 2.647a.5.5 0 01-.708-.708L7.293 8 4.646 5.354a.5.5 0 010-.708z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={stage.prompt}
                    onChange={(e) => updateStage(index, "prompt", e.target.value)}
                    placeholder="Stage prompt — describe what this stage should do..."
                    className="w-full px-3 py-2 rounded-lg bg-cc-input-bg border border-cc-border text-cc-fg text-sm resize-none h-24 font-mono-code focus:outline-none focus:ring-1 focus:ring-cc-primary"
                  />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
