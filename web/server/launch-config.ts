/**
 * launch-config.ts — Load, validate, and resolve `.companion/launch.json` files.
 *
 * A launch config defines per-project setup scripts, background services (with
 * dependency ordering), and port declarations for the Environment panel.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Types ───────────────────────────────────────────────────────────────────

export interface LaunchConditions {
  local?: boolean;
  sandbox?: boolean;
  worktree?: boolean;
}

export interface LaunchSetupScript {
  name: string;
  command: string;
  conditions?: LaunchConditions;
}

export type DependencyCondition = "started" | "ready";

export interface LaunchServiceConfig {
  command: string;
  dependsOn?: Record<string, DependencyCondition>;
  readyPattern?: string;
  readyTimeout?: number; // seconds, default 60
  conditions?: LaunchConditions;
}

export interface HealthCheckConfig {
  path?: string;
  interval?: number; // seconds, default 10
}

export interface LaunchPortConfig {
  label: string;
  openOnReady?: boolean;
  healthCheck?: HealthCheckConfig;
  protocol?: "http" | "tcp";
}

export interface LaunchConfig {
  version: string;
  setup?: LaunchSetupScript[];
  services?: Record<string, LaunchServiceConfig>;
  ports?: Record<string, LaunchPortConfig>;
}

export interface ResolvedService {
  name: string;
  command: string;
  dependsOn: Record<string, DependencyCondition>;
  readyPattern?: string;
  readyTimeout: number;
}

export interface ResolvedLaunchConfig {
  setup: LaunchSetupScript[];
  services: Record<string, ResolvedService>;
  ports: Record<string, LaunchPortConfig>;
}

export interface ExecutionContext {
  isSandbox: boolean;
  isWorktree: boolean;
}

// ── Constants ───────────────────────────────────────────────────────────────

const LAUNCH_CONFIG_FILENAME = "launch.json";
const COMPANION_DIR = ".companion";
const DEFAULT_READY_TIMEOUT = 60;

// ── Loading ─────────────────────────────────────────────────────────────────

/**
 * Load launch config from `<cwd>/.companion/launch.json`.
 * For worktree sessions, also checks the repo root as fallback.
 */
export function loadLaunchConfig(
  cwd: string,
  repoRoot?: string,
): LaunchConfig | null {
  const primary = join(cwd, COMPANION_DIR, LAUNCH_CONFIG_FILENAME);
  if (existsSync(primary)) {
    return parseLaunchConfig(primary);
  }

  // Fallback to repo root for worktree sessions
  if (repoRoot && repoRoot !== cwd) {
    const fallback = join(repoRoot, COMPANION_DIR, LAUNCH_CONFIG_FILENAME);
    if (existsSync(fallback)) {
      return parseLaunchConfig(fallback);
    }
  }

  return null;
}

function parseLaunchConfig(filePath: string): LaunchConfig | null {
  try {
    const raw = readFileSync(filePath, "utf-8");
    const config = JSON.parse(raw) as LaunchConfig;
    validate(config);
    return config;
  } catch (e) {
    console.warn(
      `[launch-config] Failed to load ${filePath}: ${e instanceof Error ? e.message : String(e)}`,
    );
    return null;
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

function validate(config: LaunchConfig): void {
  if (!config.version || typeof config.version !== "string") {
    throw new Error("launch.json requires a 'version' field");
  }

  if (config.setup !== undefined) {
    if (!Array.isArray(config.setup)) {
      throw new Error("'setup' must be an array");
    }
    for (const s of config.setup) {
      if (!s.name || typeof s.name !== "string") {
        throw new Error("Each setup script requires a 'name' string");
      }
      if (!s.command || typeof s.command !== "string") {
        throw new Error(`Setup script "${s.name}" requires a 'command' string`);
      }
    }
  }

  if (config.services !== undefined) {
    if (typeof config.services !== "object" || Array.isArray(config.services)) {
      throw new Error("'services' must be an object map");
    }
    for (const [name, svc] of Object.entries(config.services)) {
      if (!svc.command || typeof svc.command !== "string") {
        throw new Error(`Service "${name}" requires a 'command' string`);
      }
      if (svc.dependsOn) {
        for (const [dep, cond] of Object.entries(svc.dependsOn)) {
          if (cond !== "started" && cond !== "ready") {
            throw new Error(
              `Service "${name}" has invalid dependsOn condition for "${dep}": must be "started" or "ready"`,
            );
          }
          if (cond === "ready") {
            const depSvc = config.services[dep];
            if (depSvc && !depSvc.readyPattern) {
              throw new Error(
                `Service "${name}" depends on "${dep}" with condition "ready", but "${dep}" has no readyPattern`,
              );
            }
          }
        }
      }
    }
  }

  if (config.ports !== undefined) {
    if (typeof config.ports !== "object" || Array.isArray(config.ports)) {
      throw new Error("'ports' must be an object map keyed by port number");
    }
    for (const [portStr, portConfig] of Object.entries(config.ports)) {
      const portNum = Number(portStr);
      if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
        throw new Error(`Invalid port number: "${portStr}"`);
      }
      if (!portConfig.label || typeof portConfig.label !== "string") {
        throw new Error(`Port "${portStr}" requires a 'label' string`);
      }
      if (portConfig.protocol && portConfig.protocol !== "http" && portConfig.protocol !== "tcp") {
        throw new Error(`Port "${portStr}" protocol must be "http" or "tcp"`);
      }
    }
  }
}

/**
 * Validate a launch config object and return structured results.
 * Unlike the internal `validate()` which throws, this collects all errors.
 */
export function validateConfig(raw: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Config must be a non-null object"] };
  }

  const config = raw as LaunchConfig;

  try {
    validate(config);
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
  }

  return { valid: errors.length === 0, errors };
}

// ── Context Resolution ──────────────────────────────────────────────────────

/**
 * Filter setup scripts and services by execution context (local/sandbox/worktree),
 * prune dependency graph, and normalize resolved services.
 */
export function resolveForContext(
  config: LaunchConfig,
  ctx: ExecutionContext,
): ResolvedLaunchConfig {
  const envType = ctx.isSandbox ? "sandbox" : ctx.isWorktree ? "worktree" : "local";

  // Filter setup scripts
  const setup = (config.setup ?? []).filter((s) => matchesConditions(s.conditions, envType));

  // Filter services
  const filteredServices: Record<string, ResolvedService> = {};
  for (const [name, svc] of Object.entries(config.services ?? {})) {
    if (!matchesConditions(svc.conditions, envType)) continue;

    // Prune dependsOn: remove references to services that were filtered out
    const prunedDeps: Record<string, DependencyCondition> = {};
    if (svc.dependsOn) {
      for (const [dep, cond] of Object.entries(svc.dependsOn)) {
        // Only keep deps that exist and pass conditions
        const depSvc = config.services?.[dep];
        if (depSvc && matchesConditions(depSvc.conditions, envType)) {
          prunedDeps[dep] = cond;
        }
        // If dep was filtered out, treat as satisfied (skip it)
      }
    }

    filteredServices[name] = {
      name,
      command: svc.command,
      dependsOn: prunedDeps,
      readyPattern: svc.readyPattern,
      readyTimeout: svc.readyTimeout ?? DEFAULT_READY_TIMEOUT,
    };
  }

  return {
    setup,
    services: filteredServices,
    ports: config.ports ?? {},
  };
}

function matchesConditions(
  conditions: LaunchConditions | undefined,
  envType: "local" | "sandbox" | "worktree",
): boolean {
  if (!conditions) return true; // No conditions = runs everywhere
  return conditions[envType] === true;
}

// ── Dependency Graph / Topological Sort ─────────────────────────────────────

/**
 * Build execution waves via topological sort. Returns an array of arrays:
 * each inner array is a group of service names that can start in parallel.
 *
 * @throws Error on circular dependencies
 */
export function buildStartupOrder(
  services: Record<string, ResolvedService>,
): string[][] {
  const names = Object.keys(services);
  if (names.length === 0) return [];

  // Build adjacency: for each service, which services must start before it?
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // dep → services that depend on it

  for (const name of names) {
    inDegree.set(name, 0);
    dependents.set(name, []);
  }

  for (const [name, svc] of Object.entries(services)) {
    const depCount = Object.keys(svc.dependsOn).length;
    inDegree.set(name, depCount);
    for (const dep of Object.keys(svc.dependsOn)) {
      dependents.get(dep)?.push(name);
    }
  }

  // Kahn's algorithm — collect waves instead of a flat list
  const waves: string[][] = [];
  let remaining = names.length;

  // First wave: all services with no dependencies
  let currentWave = names.filter((n) => inDegree.get(n) === 0);

  while (currentWave.length > 0) {
    waves.push(currentWave);
    remaining -= currentWave.length;

    const nextWave: string[] = [];
    for (const name of currentWave) {
      for (const dependent of dependents.get(name) ?? []) {
        const newDeg = (inDegree.get(dependent) ?? 1) - 1;
        inDegree.set(dependent, newDeg);
        if (newDeg === 0) {
          nextWave.push(dependent);
        }
      }
    }
    currentWave = nextWave;
  }

  if (remaining > 0) {
    // Find the cycle for a useful error message
    const inCycle = names.filter((n) => (inDegree.get(n) ?? 0) > 0);
    throw new Error(
      `Circular dependency detected among services: ${inCycle.join(", ")}`,
    );
  }

  return waves;
}
