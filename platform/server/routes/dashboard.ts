import { Hono } from "hono";

/**
 * Dashboard routes for usage metrics and account info.
 *
 * GET /dashboard/usage — Usage metrics for billing display
 */

const dashboard = new Hono();

dashboard.get("/usage", async (c) => {
  // TODO: Aggregate usage from instances:
  // - Instance uptime hours
  // - Agent execution count
  // - Storage used
  return c.json({
    instances: 0,
    uptimeHours: 0,
    agentRuns: 0,
    storageUsedGb: 0,
  });
});

export { dashboard };
