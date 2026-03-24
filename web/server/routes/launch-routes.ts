import type { Hono } from "hono";
import { loadLaunchConfig } from "../launch-config.js";
import { getPortStatuses, checkPort } from "../port-monitor.js";
import { getServiceStatuses } from "../launch-runner.js";

export function registerLaunchRoutes(api: Hono): void {
  // Check if a launch config exists for a given working directory
  api.get("/launch-config", (c) => {
    const cwd = c.req.query("cwd");
    if (!cwd) {
      return c.json({ error: "cwd query parameter is required" }, 400);
    }

    const config = loadLaunchConfig(cwd);
    return c.json({
      exists: config !== null,
      config: config ?? undefined,
    });
  });

  // Get port health statuses for a session
  api.get("/sessions/:id/ports", (c) => {
    const sessionId = c.req.param("id");
    const statuses = getPortStatuses(sessionId);
    return c.json(statuses);
  });

  // Trigger a manual health check for a specific port
  api.post("/sessions/:id/ports/:port/check", async (c) => {
    const sessionId = c.req.param("id");
    const port = Number(c.req.param("port"));
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return c.json({ error: "Invalid port number" }, 400);
    }

    const status = await checkPort(sessionId, port);
    return c.json({ port, status });
  });

  // Get service statuses for a session
  api.get("/sessions/:id/services", (c) => {
    const sessionId = c.req.param("id");
    const statuses = getServiceStatuses(sessionId);
    return c.json(statuses);
  });
}
