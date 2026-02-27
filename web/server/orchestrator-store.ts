import {
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  OrchestratorConfig,
  OrchestratorConfigCreateInput,
  OrchestratorRun,
} from "./orchestrator-types.js";

// ─── Paths ──────────────────────────────────────────────────────────────────

const COMPANION_DIR = join(homedir(), ".companion");
const ORCHESTRATORS_DIR = join(COMPANION_DIR, "orchestrators");
const RUNS_DIR = join(COMPANION_DIR, "orchestrator-runs");

function ensureOrchestratorsDir(): void {
  mkdirSync(ORCHESTRATORS_DIR, { recursive: true });
}

function ensureRunsDir(): void {
  mkdirSync(RUNS_DIR, { recursive: true });
}

function orchestratorPath(id: string): string {
  return join(ORCHESTRATORS_DIR, `${id}.json`);
}

function runPath(runId: string): string {
  return join(RUNS_DIR, `${runId}.json`);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Orchestrator CRUD ──────────────────────────────────────────────────────

export function listOrchestrators(): OrchestratorConfig[] {
  ensureOrchestratorsDir();
  try {
    const files = readdirSync(ORCHESTRATORS_DIR).filter((f) => f.endsWith(".json"));
    const orchestrators: OrchestratorConfig[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(ORCHESTRATORS_DIR, file), "utf-8");
        orchestrators.push(JSON.parse(raw));
      } catch {
        // Skip corrupt files
      }
    }
    orchestrators.sort((a, b) => a.name.localeCompare(b.name));
    return orchestrators;
  } catch {
    return [];
  }
}

export function getOrchestrator(id: string): OrchestratorConfig | null {
  ensureOrchestratorsDir();
  try {
    const raw = readFileSync(orchestratorPath(id), "utf-8");
    return JSON.parse(raw) as OrchestratorConfig;
  } catch {
    return null;
  }
}

export function createOrchestrator(data: OrchestratorConfigCreateInput): OrchestratorConfig {
  if (!data.name || !data.name.trim()) throw new Error("Orchestrator name is required");
  if (!data.stages || data.stages.length === 0) throw new Error("At least one stage is required");
  if (!data.envSlug || !data.envSlug.trim()) throw new Error("Environment slug is required (Docker is mandatory)");

  const id = slugify(data.name.trim());
  if (!id) throw new Error("Orchestrator name must contain alphanumeric characters");

  ensureOrchestratorsDir();
  if (existsSync(orchestratorPath(id))) {
    throw new Error(`An orchestrator with a similar name already exists ("${id}")`);
  }

  const now = Date.now();
  const orchestrator: OrchestratorConfig = {
    ...data,
    id,
    name: data.name.trim(),
    description: data.description?.trim() || "",
    cwd: data.cwd?.trim() || "",
    createdAt: now,
    updatedAt: now,
    totalRuns: 0,
  };
  writeFileSync(orchestratorPath(id), JSON.stringify(orchestrator, null, 2), "utf-8");
  return orchestrator;
}

export function updateOrchestrator(
  id: string,
  updates: Partial<OrchestratorConfig>,
): OrchestratorConfig | null {
  ensureOrchestratorsDir();
  const existing = getOrchestrator(id);
  if (!existing) return null;

  const newName = updates.name?.trim() || existing.name;
  const newId = slugify(newName);
  if (!newId) throw new Error("Orchestrator name must contain alphanumeric characters");

  // If name changed, check for slug collision with a different orchestrator
  if (newId !== id && existsSync(orchestratorPath(newId))) {
    throw new Error(`An orchestrator with a similar name already exists ("${newId}")`);
  }

  const orchestrator: OrchestratorConfig = {
    ...existing,
    ...updates,
    id: newId,
    name: newName,
    updatedAt: Date.now(),
    // Preserve immutable fields
    createdAt: existing.createdAt,
  };

  // If id changed, delete old file
  if (newId !== id) {
    try {
      unlinkSync(orchestratorPath(id));
    } catch {
      /* ok */
    }
  }

  writeFileSync(orchestratorPath(newId), JSON.stringify(orchestrator, null, 2), "utf-8");
  return orchestrator;
}

export function deleteOrchestrator(id: string): boolean {
  ensureOrchestratorsDir();
  if (!existsSync(orchestratorPath(id))) return false;
  try {
    unlinkSync(orchestratorPath(id));
    return true;
  } catch {
    return false;
  }
}

// ─── Run CRUD ───────────────────────────────────────────────────────────────

export function listRuns(orchestratorId?: string): OrchestratorRun[] {
  ensureRunsDir();
  try {
    const files = readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"));
    const runs: OrchestratorRun[] = [];
    for (const file of files) {
      try {
        const raw = readFileSync(join(RUNS_DIR, file), "utf-8");
        const run = JSON.parse(raw) as OrchestratorRun;
        if (!orchestratorId || run.orchestratorId === orchestratorId) {
          runs.push(run);
        }
      } catch {
        // Skip corrupt files
      }
    }
    // Sort by createdAt descending (newest first)
    runs.sort((a, b) => b.createdAt - a.createdAt);
    return runs;
  } catch {
    return [];
  }
}

export function getRun(runId: string): OrchestratorRun | null {
  ensureRunsDir();
  try {
    const raw = readFileSync(runPath(runId), "utf-8");
    return JSON.parse(raw) as OrchestratorRun;
  } catch {
    return null;
  }
}

export function createRun(run: OrchestratorRun): OrchestratorRun {
  ensureRunsDir();
  writeFileSync(runPath(run.id), JSON.stringify(run, null, 2), "utf-8");
  return run;
}

export function updateRun(
  runId: string,
  updates: Partial<OrchestratorRun>,
): OrchestratorRun | null {
  const existing = getRun(runId);
  if (!existing) return null;

  const updated: OrchestratorRun = {
    ...existing,
    ...updates,
    // Preserve immutable fields
    id: existing.id,
    orchestratorId: existing.orchestratorId,
    createdAt: existing.createdAt,
  };

  writeFileSync(runPath(runId), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export function deleteRun(runId: string): boolean {
  ensureRunsDir();
  if (!existsSync(runPath(runId))) return false;
  try {
    unlinkSync(runPath(runId));
    return true;
  } catch {
    return false;
  }
}
