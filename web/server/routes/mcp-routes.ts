/**
 * mcp-routes.ts — Register the MCP HTTP endpoint for agent tool access.
 *
 * Exposes POST /mcp which accepts JSON-RPC 2.0 requests from Claude Code
 * and Codex agents via the MCP HTTP protocol.
 */

import type { Hono } from "hono";
import type { WsBridge } from "../ws-bridge.js";
import type { CliLauncher } from "../cli-launcher.js";
import { handleMcpRequest } from "../mcp-server.js";

export function registerMcpRoutes(
  api: Hono,
  wsBridge: WsBridge,
  launcher: CliLauncher,
): void {
  api.post("/mcp", async (c) => {
    const sessionId = c.req.query("sessionId") ?? null;

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        400,
      );
    }

    // Basic JSON-RPC shape validation
    const rpc = body as Record<string, unknown>;
    if (!rpc || typeof rpc !== "object" || rpc.jsonrpc !== "2.0") {
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid JSON-RPC request" } },
        400,
      );
    }

    const response = await handleMcpRequest(
      body as Parameters<typeof handleMcpRequest>[0],
      sessionId,
      { wsBridge, launcher },
    );

    return c.json(response);
  });
}
