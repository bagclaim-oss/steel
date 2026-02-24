import { Hono } from "hono";

/**
 * Tailscale management routes.
 *
 * POST /instances/:id/tailscale/enable   — Enable Tailscale on instance
 * POST /instances/:id/tailscale/disable  — Disable Tailscale on instance
 * GET  /instances/:id/tailscale/status   — Get Tailscale connection status
 */

const tailscale = new Hono();

tailscale.post("/enable", async (c) => {
  // TODO: Accept tailscale auth key, store encrypted, restart instance
  return c.json({ message: "Tailscale enabling" });
});

tailscale.post("/disable", async (c) => {
  // TODO: Remove tailscale config, restart instance
  return c.json({ message: "Tailscale disabling" });
});

tailscale.get("/status", async (c) => {
  // TODO: Query instance for tailscale status
  return c.json({ enabled: false, hostname: null });
});

export { tailscale };
