import type { Hono } from "hono";
import type { CliLauncher } from "../cli-launcher.js";
import { loadLaunchConfig, resolveForContext } from "../launch-config.js";
import { getPortStatuses, checkPort, startMonitoring, stopMonitoring } from "../port-monitor.js";
import { getServiceStatuses, stopAllServices, startServices } from "../launch-runner.js";

export function registerLaunchRoutes(api: Hono, launcher: CliLauncher): void {
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

  // Reload .companion/launch.json — stops existing services/monitoring,
  // re-reads config, starts services and port monitoring fresh.
  api.post("/sessions/:id/launch-config/reload", async (c) => {
    const sessionId = c.req.param("id");
    const session = launcher.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    // Validate config exists before tearing down running services
    const config = loadLaunchConfig(session.cwd);
    if (!config) {
      return c.json({ reloaded: false, error: "No .companion/launch.json found" });
    }

    // Stop existing services and port monitoring only after confirming valid config
    stopAllServices(sessionId);
    stopMonitoring(sessionId);

    const resolved = resolveForContext(config, {
      isSandbox: !!session.containerId,
      isWorktree: false,
    });

    // Start services
    const serviceNames = Object.keys(resolved.services);
    if (serviceNames.length > 0) {
      await startServices(resolved, {
        cwd: session.cwd,
        containerId: session.containerId,
        sessionId,
      });
    }

    // Start port monitoring (health checks auto-broadcast via companionBus)
    const portKeys = Object.keys(resolved.ports);
    if (portKeys.length > 0) {
      startMonitoring(sessionId, resolved.ports);
    }

    return c.json({
      reloaded: true,
      services: serviceNames,
      ports: portKeys,
    });
  });
}
