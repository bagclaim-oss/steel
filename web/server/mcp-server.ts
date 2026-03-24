/**
 * mcp-server.ts — MCP HTTP server handler implementing JSON-RPC 2.0.
 *
 * Exposes Companion tools (validate_launch_config, test_launch_config) to
 * Claude Code and Codex agents via the MCP HTTP protocol. Auto-injected
 * into every session so agents get these tools without needing a CLI install.
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { connect } from "node:net";
import { loadLaunchConfig, validateConfig, resolveForContext, buildStartupOrder } from "./launch-config.js";
import type { LaunchConfig } from "./launch-config.js";
import { runSetupScripts, startServices, stopAllServices } from "./launch-runner.js";
import type { WsBridge } from "./ws-bridge.js";
import type { CliLauncher } from "./cli-launcher.js";

// ── JSON-RPC Types ─────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Tool Definitions ───────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "validate_launch_config",
    description:
      "Validate a .companion/launch.json config file. Returns structured validation results including errors and a config summary (services, ports, setup scripts).",
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory to check. Defaults to the session's working directory.",
        },
      },
    },
  },
  {
    name: "test_launch_config",
    description:
      "Dry-run test of a .companion/launch.json config. Validates the config, attempts to start services, checks port health, then stops everything. Returns a full report.",
    inputSchema: {
      type: "object" as const,
      properties: {
        cwd: {
          type: "string",
          description: "Project directory to test. Defaults to the session's working directory.",
        },
        context: {
          type: "object",
          description: "Execution context for condition filtering.",
          properties: {
            isSandbox: { type: "boolean" },
            isWorktree: { type: "boolean" },
          },
        },
      },
    },
  },
];

// ── Server Info ────────────────────────────────────────────────────────────

let cachedVersion: string | null = null;
function getVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    cachedVersion = pkg.version ?? "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion!;
}

// ── Handler ────────────────────────────────────────────────────────────────

export interface McpHandlerDeps {
  wsBridge: WsBridge;
  launcher: CliLauncher;
}

/**
 * Handle an MCP JSON-RPC request and return a JSON-RPC response.
 */
export async function handleMcpRequest(
  body: JsonRpcRequest,
  sessionId: string | null,
  deps: McpHandlerDeps,
): Promise<JsonRpcResponse> {
  const id = body.id ?? null;

  switch (body.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "companion", version: getVersion() },
        },
      };

    case "notifications/initialized":
      // Client acknowledgment — no response needed, but return success
      return { jsonrpc: "2.0", id, result: {} };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      };

    case "tools/call":
      return handleToolCall(body.params ?? {}, sessionId, deps, id);

    default:
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32601, message: `Method not found: ${body.method}` },
      };
  }
}

// ── Tool Dispatch ──────────────────────────────────────────────────────────

async function handleToolCall(
  params: Record<string, unknown>,
  sessionId: string | null,
  deps: McpHandlerDeps,
  id: string | number | null,
): Promise<JsonRpcResponse> {
  const toolName = params.name as string | undefined;
  const args = (params.arguments ?? {}) as Record<string, unknown>;

  if (!toolName) {
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32602, message: "Missing tool name in params.name" },
    };
  }

  // Resolve cwd from tool args or session
  const cwd = resolveCwd(args, sessionId, deps);

  try {
    switch (toolName) {
      case "validate_launch_config":
        return { jsonrpc: "2.0", id, result: toolResult(await toolValidate(cwd)) };

      case "test_launch_config":
        return { jsonrpc: "2.0", id, result: toolResult(await toolTest(cwd, args)) };

      default:
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32602, message: `Unknown tool: ${toolName}` },
        };
    }
  } catch (e) {
    return {
      jsonrpc: "2.0",
      id,
      result: toolResult({ error: e instanceof Error ? e.message : String(e) }, true),
    };
  }
}

function toolResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    isError,
  };
}

function resolveCwd(
  args: Record<string, unknown>,
  sessionId: string | null,
  deps: McpHandlerDeps,
): string | null {
  if (typeof args.cwd === "string" && args.cwd) return args.cwd;
  if (!sessionId) return null;

  // Try ws-bridge session state first
  const bridgeSession = deps.wsBridge.getSession(sessionId);
  if (bridgeSession?.state?.cwd) return bridgeSession.state.cwd;

  // Fall back to launcher session info
  const launcherSession = deps.launcher.getSession(sessionId);
  if (launcherSession?.cwd) return launcherSession.cwd;

  return null;
}

// ── Tool: validate_launch_config ───────────────────────────────────────────

function buildConfigSummary(config: LaunchConfig) {
  return {
    version: config.version,
    setup_count: config.setup?.length ?? 0,
    service_count: config.services ? Object.keys(config.services).length : 0,
    port_count: config.ports ? Object.keys(config.ports).length : 0,
    services: config.services ? Object.keys(config.services) : [],
    ports: config.ports
      ? Object.fromEntries(
          Object.entries(config.ports).map(([port, cfg]) => [port, cfg.label]),
        )
      : {},
  };
}

async function toolValidate(cwd: string | null) {
  if (!cwd) {
    return { valid: false, errors: ["No working directory available. Provide 'cwd' argument."], config_summary: null };
  }

  const config = loadLaunchConfig(cwd);
  if (!config) {
    return { valid: false, errors: ["No .companion/launch.json found or file is invalid."], config_summary: null };
  }

  const validation = validateConfig(config);
  return {
    valid: validation.valid,
    errors: validation.errors,
    config_summary: buildConfigSummary(config),
  };
}

// ── Tool: test_launch_config ───────────────────────────────────────────────

async function toolTest(cwd: string | null, args: Record<string, unknown>) {
  if (!cwd) {
    return { valid: false, errors: ["No working directory available. Provide 'cwd' argument."] };
  }

  const config = loadLaunchConfig(cwd);
  if (!config) {
    return { valid: false, errors: ["No .companion/launch.json found or file is invalid."] };
  }

  const validation = validateConfig(config);
  if (!validation.valid) {
    return { valid: false, errors: validation.errors, config_summary: buildConfigSummary(config) };
  }

  const ctx = (args.context as { isSandbox?: boolean; isWorktree?: boolean } | undefined) ?? {};
  const resolved = resolveForContext(config, {
    isSandbox: ctx.isSandbox ?? false,
    isWorktree: ctx.isWorktree ?? false,
  });

  const configSummary = buildConfigSummary(config);
  let startupOrder: string[][] = [];

  try {
    startupOrder = buildStartupOrder(resolved.services);
  } catch (e) {
    return {
      valid: false,
      errors: [e instanceof Error ? e.message : String(e)],
      config_summary: configSummary,
    };
  }

  // Use a temporary session ID for the test run
  const testSessionId = `mcp-test-${Date.now()}`;
  const setupResults: Array<{ name: string; ok: boolean; error?: string }> = [];
  const serviceResults: Array<{ name: string; started: boolean; ready: boolean; error?: string }> = [];
  const portResults: Array<{ port: number; label: string; status: string }> = [];

  try {
    // Run setup scripts
    if (resolved.setup.length > 0) {
      const setupResult = await runSetupScripts(resolved.setup, {
        cwd,
        timeout: 30_000,
      });
      setupResults.push({
        name: resolved.setup.map((s) => s.name).join(", "),
        ok: setupResult.ok,
        error: setupResult.error,
      });
    }

    // Start services
    if (Object.keys(resolved.services).length > 0) {
      await startServices(resolved, {
        cwd,
        sessionId: testSessionId,
        onProgress: (name, status, detail) => {
          const existing = serviceResults.find((s) => s.name === name);
          if (existing) {
            existing.started = status === "started" || status === "ready";
            existing.ready = status === "ready";
            if (detail && status === "failed") existing.error = detail;
          } else {
            serviceResults.push({
              name,
              started: status === "started" || status === "ready",
              ready: status === "ready",
              error: status === "failed" ? detail : undefined,
            });
          }
        },
      });

      // Brief pause for services to stabilize
      await new Promise((r) => setTimeout(r, 2000));
    }

    // Check port health with direct probes
    if (config.ports) {
      for (const [portStr, portConfig] of Object.entries(config.ports)) {
        const port = Number(portStr);
        const protocol = portConfig.protocol ?? "http";
        const status = protocol === "http"
          ? await probeHttp(port, portConfig.healthCheck?.path ?? "/")
          : await probeTcp(port);
        portResults.push({ port, label: portConfig.label, status });
      }
    }
  } finally {
    // Always clean up
    stopAllServices(testSessionId);
  }

  return {
    valid: true,
    config_summary: configSummary,
    startup_order: startupOrder,
    setup_results: setupResults,
    service_results: serviceResults,
    port_results: portResults,
  };
}

// ── Direct Port Probes (for test tool, no monitor dependency) ──────────────

async function probeHttp(port: number, path: string): Promise<string> {
  try {
    const url = `http://127.0.0.1:${port}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok ? "healthy" : "unhealthy";
  } catch {
    return "unreachable";
  }
}

function probeTcp(port: number): Promise<string> {
  return new Promise((resolve) => {
    const socket = connect({ host: "127.0.0.1", port, timeout: 5000 });
    socket.on("connect", () => {
      socket.destroy();
      resolve("healthy");
    });
    socket.on("error", () => {
      socket.destroy();
      resolve("unreachable");
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve("unreachable");
    });
  });
}
