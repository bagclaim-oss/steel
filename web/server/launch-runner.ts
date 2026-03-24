/**
 * launch-runner.ts — Execute setup scripts and manage background service
 * processes with dependency-aware startup ordering.
 */

import { spawn, type ChildProcess } from "node:child_process";
import type { ResolvedService, LaunchSetupScript, ResolvedLaunchConfig } from "./launch-config.js";
import { buildStartupOrder } from "./launch-config.js";
import { containerManager } from "./container-manager.js";
import { log } from "./logger.js";

// ── Types ───────────────────────────────────────────────────────────────────

export type ServiceStatus = "starting" | "started" | "ready" | "failed" | "stopped";

export interface ServiceHandle {
  name: string;
  pid: number | undefined;
  port: number | undefined;
  status: ServiceStatus;
  process: ChildProcess | null;
  /** Subscribe to stdout/stderr lines. Returns unsubscribe function. */
  onLine(cb: (line: string) => void): () => void;
  kill(): void;
}

export interface RunSetupOpts {
  cwd: string;
  containerId?: string;
  onOutput?: (scriptName: string, line: string) => void;
  timeout?: number; // ms per script, default 120_000
}

export interface StartServicesOpts {
  cwd: string;
  containerId?: string;
  sessionId: string;
  onProgress?: (serviceName: string, status: ServiceStatus, detail?: string) => void;
  onOutput?: (serviceName: string, line: string) => void;
}

// ── Module state ────────────────────────────────────────────────────────────

const sessionServices = new Map<string, ServiceHandle[]>();

// ── Setup Scripts ───────────────────────────────────────────────────────────

/**
 * Run setup scripts sequentially. Fails fast on first non-zero exit.
 */
export async function runSetupScripts(
  scripts: LaunchSetupScript[],
  opts: RunSetupOpts,
): Promise<{ ok: boolean; error?: string }> {
  const timeout = opts.timeout ?? 120_000;

  for (const script of scripts) {
    log.info("launch-runner", ` Running setup: ${script.name} → ${script.command}`);
    try {
      const result = opts.containerId
        ? await runInContainer(script.command, opts.containerId, { timeout, onOutput: (line) => opts.onOutput?.(script.name, line) })
        : await runLocal(script.command, opts.cwd, { timeout, onOutput: (line) => opts.onOutput?.(script.name, line) });

      if (result.exitCode !== 0) {
        const truncated = result.output.length > 2000
          ? result.output.slice(0, 500) + "\n...[truncated]...\n" + result.output.slice(-1500)
          : result.output;
        return {
          ok: false,
          error: `Setup "${script.name}" failed (exit ${result.exitCode}):\n${truncated}`,
        };
      }
      log.info("launch-runner", ` Setup "${script.name}" completed`);
    } catch (e) {
      return {
        ok: false,
        error: `Setup "${script.name}" failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  return { ok: true };
}

async function runLocal(
  command: string,
  cwd: string,
  opts: { timeout: number; onOutput?: (line: string) => void },
): Promise<{ exitCode: number; output: string }> {
  return new Promise<{ exitCode: number; output: string }>((resolve, reject) => {
    const proc = spawn("sh", ["-lc", command], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });

    const lines: string[] = [];
    const pipeLines = (stream: NodeJS.ReadableStream | null) => {
      if (!stream) return;
      let buffer = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk: string) => {
        buffer += chunk;
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          lines.push(part);
          opts.onOutput?.(part);
        }
      });
      stream.on("end", () => {
        if (buffer) {
          lines.push(buffer);
          opts.onOutput?.(buffer);
        }
      });
    };
    pipeLines(proc.stdout);
    pipeLines(proc.stderr);

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out after ${opts.timeout}ms`));
    }, opts.timeout);

    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ exitCode: code ?? 1, output: lines.join("\n") });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function runInContainer(
  command: string,
  containerId: string,
  opts: { timeout: number; onOutput?: (line: string) => void },
): Promise<{ exitCode: number; output: string }> {
  return containerManager.execInContainerAsync(containerId, ["sh", "-lc", command], {
    timeout: opts.timeout,
    onOutput: opts.onOutput,
  });
}

// ── Line Emitter ────────────────────────────────────────────────────────────

/**
 * Simple pub/sub for stdout/stderr lines from a service process.
 * Allows both the output piping and readyPattern matching to subscribe.
 */
class LineEmitter {
  private listeners = new Set<(line: string) => void>();

  subscribe(cb: (line: string) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  emit(line: string): void {
    for (const cb of this.listeners) {
      try {
        cb(line);
      } catch {
        // don't let subscriber errors kill the pipe
      }
    }
  }
}

/** Pipe a Node.js readable stream line by line into a LineEmitter. */
function pipeNodeStreamToEmitter(
  stream: NodeJS.ReadableStream | null,
  emitter: LineEmitter,
): void {
  if (!stream) return;
  let buffer = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    buffer += chunk;
    const parts = buffer.split("\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      emitter.emit(part);
    }
  });
  stream.on("end", () => {
    if (buffer) emitter.emit(buffer);
  });
}

// ── Service Startup (dependency-aware) ──────────────────────────────────────

/**
 * Start all services in dependency order. Uses execution waves from
 * topological sort — services within the same wave start in parallel.
 */
export async function startServices(
  resolved: ResolvedLaunchConfig,
  opts: StartServicesOpts,
): Promise<{ ok: boolean; error?: string }> {
  const { services } = resolved;
  const serviceNames = Object.keys(services);
  if (serviceNames.length === 0) return { ok: true };

  const waves = buildStartupOrder(services);
  const handles: ServiceHandle[] = [];
  const readyPromises = new Map<string, Promise<void>>();
  const readyResolvers = new Map<string, () => void>();
  const startedPromises = new Map<string, Promise<void>>();
  const startedResolvers = new Map<string, () => void>();

  // Pre-create promise/resolver pairs for each service
  for (const name of serviceNames) {
    let readyResolve!: () => void;
    readyPromises.set(name, new Promise<void>((r) => { readyResolve = r; }));
    readyResolvers.set(name, readyResolve);

    let startedResolve!: () => void;
    startedPromises.set(name, new Promise<void>((r) => { startedResolve = r; }));
    startedResolvers.set(name, startedResolve);
  }

  for (const wave of waves) {
    // Wait for all dependencies of this wave's services
    const depWaits: Promise<void>[] = [];
    for (const name of wave) {
      const svc = services[name];
      for (const [dep, cond] of Object.entries(svc.dependsOn)) {
        depWaits.push(
          cond === "ready" ? readyPromises.get(dep)! : startedPromises.get(dep)!,
        );
      }
    }
    await Promise.all(depWaits);

    // Start all services in this wave in parallel
    const wavePromises = wave.map(async (name) => {
      const svc = services[name];
      opts.onProgress?.(name, "starting");
      log.info("launch-runner", ` Starting service: ${name} → ${svc.command}`);

      try {
        const handle = spawnService(name, svc, opts);
        handles.push(handle);

        // Mark as started immediately (process is spawned)
        handle.status = "started";
        startedResolvers.get(name)?.();
        opts.onProgress?.(name, "started");

        // Wait for readyPattern if defined
        if (svc.readyPattern) {
          const matched = await waitForReady(handle, svc);
          if (matched) {
            handle.status = "ready";
            opts.onProgress?.(name, "ready", `Matched: ${svc.readyPattern}`);
          } else {
            opts.onProgress?.(name, "started", `readyPattern timeout after ${svc.readyTimeout}s`);
            log.warn("launch-runner", ` Service "${name}" readyPattern timeout after ${svc.readyTimeout}s`);
          }
        } else {
          handle.status = "ready";
          opts.onProgress?.(name, "ready");
        }

        // Resolve ready (even on timeout — don't block dependents forever)
        readyResolvers.get(name)?.();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error("launch-runner", ` Service "${name}" failed to start: ${msg}`);
        opts.onProgress?.(name, "failed", msg);
        // Unblock dependents
        startedResolvers.get(name)?.();
        readyResolvers.get(name)?.();
      }
    });

    await Promise.all(wavePromises);
  }

  sessionServices.set(opts.sessionId, handles);
  return { ok: true };
}

function spawnService(
  name: string,
  svc: ResolvedService,
  opts: StartServicesOpts,
): ServiceHandle {
  const emitter = new LineEmitter();

  // Forward lines to the caller's onOutput
  if (opts.onOutput) {
    emitter.subscribe((line) => opts.onOutput!(name, line));
  }

  const cmd = opts.containerId
    ? ["docker", "exec", opts.containerId, "sh", "-lc", svc.command]
    : ["sh", "-lc", svc.command];

  const proc = spawn(cmd[0], cmd.slice(1), {
    cwd: opts.containerId ? undefined : opts.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    env: opts.containerId ? undefined : { ...process.env },
  });

  pipeNodeStreamToEmitter(proc.stdout, emitter);
  pipeNodeStreamToEmitter(proc.stderr, emitter);

  const handle: ServiceHandle = {
    name,
    pid: proc.pid,
    port: undefined,
    status: "starting",
    process: proc,
    onLine: (cb) => emitter.subscribe(cb),
    kill() {
      try {
        proc.kill();
      } catch {
        // already dead
      }
      this.status = "stopped";
    },
  };

  // Monitor process exit
  proc.on("close", (code) => {
    if (handle.status !== "stopped") {
      handle.status = "failed";
      log.warn("launch-runner", ` Service "${name}" exited with code ${code}`);
    }
  });

  return handle;
}

// ── Ready Pattern Matching ──────────────────────────────────────────────────

/**
 * Wait for a service's readyPattern to match in stdout/stderr.
 * Returns true if matched, false on timeout.
 */
function waitForReady(
  handle: ServiceHandle,
  svc: ResolvedService,
): Promise<boolean> {
  if (!svc.readyPattern) return Promise.resolve(true);

  const regex = new RegExp(svc.readyPattern);
  const timeoutMs = svc.readyTimeout * 1000;

  return new Promise<boolean>((resolve) => {
    let resolved = false;

    const unsub = handle.onLine((line) => {
      if (resolved) return;
      if (regex.test(line)) {
        resolved = true;
        unsub();
        resolve(true);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        unsub();
        resolve(false);
      }
    }, timeoutMs);
  });
}

// ── Lifecycle Management ────────────────────────────────────────────────────

/** Stop all background services for a session (reverse order). */
export function stopAllServices(sessionId: string): void {
  const handles = sessionServices.get(sessionId);
  if (!handles) return;

  log.info("launch-runner", ` Stopping ${handles.length} service(s) for session ${sessionId}`);

  // Kill in reverse order (dependents first)
  for (let i = handles.length - 1; i >= 0; i--) {
    handles[i].kill();
  }

  sessionServices.delete(sessionId);
}

/** Get all running service handles for a session. */
export function getServices(sessionId: string): ServiceHandle[] {
  return sessionServices.get(sessionId) ?? [];
}

/** Get service statuses in a serializable format. */
export function getServiceStatuses(
  sessionId: string,
): Array<{ name: string; status: ServiceStatus; pid?: number }> {
  return getServices(sessionId).map((h) => ({
    name: h.name,
    status: h.status,
    pid: h.pid,
  }));
}

/** Stop all services across all sessions (for server shutdown). */
export function stopAll(): void {
  for (const [sessionId] of sessionServices) {
    stopAllServices(sessionId);
  }
}
