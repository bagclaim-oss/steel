import { useState, useEffect, useCallback } from "react";
import { api, type AgentExecution, type AgentInfo, type ExecutionListResult } from "../api.js";
import { timeAgo } from "../utils/time-ago.js";

// ─── Types ──────────────────────────────────────────────────────────────────

type TriggerFilter = "all" | "manual" | "webhook" | "schedule" | "chat";
type StatusFilter = "all" | "running" | "success" | "error";

// ─── Helpers ────────────────────────────────────────────────────────────────

function triggerLabel(type: string): string {
  switch (type) {
    case "manual": return "Manual";
    case "webhook": return "Webhook";
    case "schedule": return "Schedule";
    case "chat": return "Chat";
    default: return type;
  }
}

function triggerColor(type: string): string {
  switch (type) {
    case "manual": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "webhook": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "schedule": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
    case "chat": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400";
  }
}

function statusIndicator(exec: AgentExecution): { label: string; color: string } {
  if (exec.error) return { label: "Error", color: "text-red-500" };
  if (exec.success) return { label: "Success", color: "text-green-500" };
  if (!exec.completedAt) return { label: "Running", color: "text-yellow-500" };
  return { label: "Unknown", color: "text-gray-500" };
}

function formatDuration(startedAt: number, completedAt?: number): string {
  const end = completedAt || Date.now();
  const ms = end - startedAt;
  if (ms < 1000) return "<1s";
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function RunsPage() {
  const [executions, setExecutions] = useState<AgentExecution[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [triggerFilter, setTriggerFilter] = useState<TriggerFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [selectedExec, setSelectedExec] = useState<AgentExecution | null>(null);

  const fetchExecutions = useCallback(async () => {
    try {
      const opts: Record<string, string | number> = { limit: 100 };
      if (triggerFilter !== "all") opts.triggerType = triggerFilter;
      if (statusFilter !== "all") opts.status = statusFilter;
      if (agentFilter) opts.agentId = agentFilter;

      const result: ExecutionListResult = await api.listExecutions(opts);
      setExecutions(result.executions);
      setTotal(result.total);
    } catch (err) {
      console.error("[runs] Failed to fetch executions:", err);
    } finally {
      setLoading(false);
    }
  }, [triggerFilter, statusFilter, agentFilter]);

  const fetchAgents = useCallback(async () => {
    try {
      const list = await api.listAgents();
      setAgents(list);
    } catch (err) {
      console.error("[runs] Failed to fetch agents:", err);
    }
  }, []);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  useEffect(() => {
    fetchExecutions();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchExecutions, 5000);
    return () => clearInterval(interval);
  }, [fetchExecutions]);

  const agentName = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    return agent?.name || agentId;
  };

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-950">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Runs</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Monitor agent executions across all triggers
        </p>
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-gray-200 dark:border-gray-800 px-6 py-3 flex items-center gap-4 flex-wrap">
        {/* Agent filter */}
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="text-sm rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 px-2 py-1"
          aria-label="Filter by agent"
        >
          <option value="">All agents</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        {/* Trigger filter pills */}
        <div className="flex items-center gap-1">
          {(["all", "manual", "webhook", "schedule", "chat"] as TriggerFilter[]).map((t) => (
            <button
              key={t}
              onClick={() => setTriggerFilter(t)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                triggerFilter === t
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              {t === "all" ? "All triggers" : triggerLabel(t)}
            </button>
          ))}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1">
          {(["all", "running", "success", "error"] as StatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                statusFilter === s
                  ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
              }`}
            >
              {s === "all" ? "All statuses" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
          {total} total
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-gray-400">
            Loading...
          </div>
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-gray-500">
            <p className="text-sm">No executions found</p>
            <p className="text-xs mt-1">Run an agent to see executions here</p>
          </div>
        ) : (
          <table className="w-full text-sm" role="table">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/80 backdrop-blur">
              <tr className="text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <th className="px-6 py-2 font-medium">Agent</th>
                <th className="px-4 py-2 font-medium">Trigger</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Duration</th>
                <th className="px-4 py-2 font-medium">Session</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {executions.map((exec) => {
                const status = statusIndicator(exec);
                const isSelected = selectedExec?.sessionId === exec.sessionId;
                return (
                  <tr
                    key={`${exec.sessionId}-${exec.startedAt}`}
                    onClick={() => setSelectedExec(isSelected ? null : exec)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : "hover:bg-gray-50 dark:hover:bg-gray-900/50"
                    }`}
                  >
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-900 dark:text-gray-100 font-medium">
                          {agentName(exec.agentId)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${triggerColor(exec.triggerType)}`}>
                        {triggerLabel(exec.triggerType)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${status.color}`}>
                        {!exec.completedAt && !exec.error && (
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400 mr-1.5 animate-pulse" />
                        )}
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {timeAgo(exec.startedAt)}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                      {formatDuration(exec.startedAt, exec.completedAt)}
                    </td>
                    <td className="px-4 py-3">
                      {exec.sessionId && (
                        <a
                          href={`#/session/${exec.sessionId}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-xs font-mono underline"
                        >
                          Open
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel (slide up from bottom when a row is selected) */}
      {selectedExec && (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 px-6 py-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Execution Details
            </h3>
            <button
              onClick={() => setSelectedExec(null)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
              aria-label="Close details"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Agent</span>
              <p className="text-gray-900 dark:text-gray-100 font-medium">{agentName(selectedExec.agentId)}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Trigger</span>
              <p className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${triggerColor(selectedExec.triggerType)}`}>
                {triggerLabel(selectedExec.triggerType)}
              </p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Started</span>
              <p className="text-gray-900 dark:text-gray-100">{new Date(selectedExec.startedAt).toLocaleString()}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Duration</span>
              <p className="text-gray-900 dark:text-gray-100 font-mono">{formatDuration(selectedExec.startedAt, selectedExec.completedAt)}</p>
            </div>
          </div>
          {selectedExec.error && (
            <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-700 dark:text-red-400 font-mono whitespace-pre-wrap">
              {selectedExec.error}
            </div>
          )}
          {selectedExec.sessionId && (
            <a
              href={`#/session/${selectedExec.sessionId}`}
              className="mt-3 inline-flex items-center gap-1 text-sm text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Open session to view live output
            </a>
          )}
        </div>
      )}
    </div>
  );
}
