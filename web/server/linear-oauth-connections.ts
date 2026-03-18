import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { COMPANION_HOME } from "./paths.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LinearOAuthConnection {
  id: string;
  name: string;
  oauthClientId: string;
  oauthClientSecret: string;
  webhookSecret: string;
  accessToken: string;
  refreshToken: string;
  status: "connected" | "disconnected";
  createdAt: number;
  updatedAt: number;
}

/** Sanitized version for API responses (secrets masked). */
export interface LinearOAuthConnectionSummary {
  id: string;
  name: string;
  oauthClientId: string;
  status: "connected" | "disconnected";
  hasAccessToken: boolean;
  hasClientSecret: boolean;
  hasWebhookSecret: boolean;
  createdAt: number;
  updatedAt: number;
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const DEFAULT_PATH = join(COMPANION_HOME, "linear-oauth-connections.json");

// ─── Store ───────────────────────────────────────────────────────────────────

let connections: LinearOAuthConnection[] = [];
let loaded = false;
let filePath = DEFAULT_PATH;

function ensureLoaded(): void {
  if (loaded) return;
  try {
    if (existsSync(filePath)) {
      const raw = JSON.parse(readFileSync(filePath, "utf-8"));
      if (Array.isArray(raw)) {
        connections = raw.filter(
          (c: unknown): c is LinearOAuthConnection =>
            typeof c === "object" &&
            c !== null &&
            typeof (c as LinearOAuthConnection).id === "string" &&
            typeof (c as LinearOAuthConnection).oauthClientId === "string",
        );
      } else {
        connections = [];
      }
    }
  } catch {
    connections = [];
  }
  loaded = true;

  // Auto-migrate from agents with inline credentials + global settings
  migrateFromAgents();
}

// ─── Migration ───────────────────────────────────────────────────────────────

/**
 * One-time migration: if no OAuth connections exist, extract inline credentials
 * from agents and global settings into standalone OAuth connections.
 * Deduplicates by oauthClientId so multiple agents sharing the same app
 * get a single connection.
 */
function migrateFromAgents(): void {
  if (connections.length > 0) return;

  // Lazy import to avoid circular dependency at module load time
  let agentStoreModule: typeof import("./agent-store.js") | null = null;
  let settingsModule: typeof import("./settings-manager.js") | null = null;
  try {
    agentStoreModule = require("./agent-store.js") as typeof import("./agent-store.js");
    settingsModule = require("./settings-manager.js") as typeof import("./settings-manager.js");
  } catch {
    return; // Can't migrate without dependencies
  }

  const agents = agentStoreModule.listAgents();
  const seenClientIds = new Set<string>();

  for (const agent of agents) {
    const linear = agent.triggers?.linear;
    if (!linear?.oauthClientId || seenClientIds.has(linear.oauthClientId)) continue;
    seenClientIds.add(linear.oauthClientId);

    const now = Date.now();
    const conn: LinearOAuthConnection = {
      id: randomUUID(),
      name: `${agent.name} OAuth App`,
      oauthClientId: linear.oauthClientId,
      oauthClientSecret: linear.oauthClientSecret || "",
      webhookSecret: linear.webhookSecret || "",
      accessToken: linear.accessToken || "",
      refreshToken: linear.refreshToken || "",
      status: linear.accessToken ? "connected" : "disconnected",
      createdAt: now,
      updatedAt: now,
    };
    connections.push(conn);

    // Update all agents with this clientId to reference the new connection
    for (const a of agents) {
      if (a.triggers?.linear?.oauthClientId === linear.oauthClientId) {
        agentStoreModule.updateAgent(a.id, {
          triggers: {
            ...a.triggers,
            linear: {
              ...a.triggers.linear,
              oauthConnectionId: conn.id,
            },
          },
        });
      }
    }
  }

  // Also migrate from global settings if present
  const settings = settingsModule.getSettings();
  if (settings.linearOAuthClientId && !seenClientIds.has(settings.linearOAuthClientId)) {
    const now = Date.now();
    connections.push({
      id: randomUUID(),
      name: "Default OAuth App",
      oauthClientId: settings.linearOAuthClientId,
      oauthClientSecret: settings.linearOAuthClientSecret,
      webhookSecret: settings.linearOAuthWebhookSecret,
      accessToken: settings.linearOAuthAccessToken,
      refreshToken: settings.linearOAuthRefreshToken,
      status: settings.linearOAuthAccessToken ? "connected" : "disconnected",
      createdAt: now,
      updatedAt: now,
    });
  }

  if (connections.length > 0) {
    persist();
    console.log(`[linear-oauth-connections] Migrated ${connections.length} OAuth connection(s) from agents/settings`);
  }
}

function persist(): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(connections, null, 2), "utf-8");
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function listOAuthConnections(): LinearOAuthConnection[] {
  ensureLoaded();
  return [...connections];
}

export function getOAuthConnection(id: string): LinearOAuthConnection | null {
  ensureLoaded();
  return connections.find((c) => c.id === id) ?? null;
}

/** Look up an OAuth connection by its Linear OAuth app client ID. */
export function findOAuthConnectionByClientId(
  oauthClientId: string,
): LinearOAuthConnection | null {
  ensureLoaded();
  return connections.find((c) => c.oauthClientId === oauthClientId) ?? null;
}

export function createOAuthConnection(data: {
  name: string;
  oauthClientId: string;
  oauthClientSecret: string;
  webhookSecret: string;
  accessToken?: string;
  refreshToken?: string;
}): LinearOAuthConnection {
  ensureLoaded();
  const now = Date.now();
  const conn: LinearOAuthConnection = {
    id: randomUUID(),
    name: data.name.trim(),
    oauthClientId: data.oauthClientId.trim(),
    oauthClientSecret: data.oauthClientSecret.trim(),
    webhookSecret: data.webhookSecret.trim(),
    accessToken: data.accessToken?.trim() || "",
    refreshToken: data.refreshToken?.trim() || "",
    status: data.accessToken?.trim() ? "connected" : "disconnected",
    createdAt: now,
    updatedAt: now,
  };
  connections.push(conn);
  persist();
  return conn;
}

export function updateOAuthConnection(
  id: string,
  patch: Partial<Omit<LinearOAuthConnection, "id" | "createdAt">>,
): LinearOAuthConnection | null {
  ensureLoaded();
  const conn = connections.find((c) => c.id === id);
  if (!conn) return null;

  if (patch.name !== undefined) conn.name = patch.name.trim();
  if (patch.oauthClientId !== undefined) conn.oauthClientId = patch.oauthClientId.trim();
  if (patch.oauthClientSecret !== undefined) conn.oauthClientSecret = patch.oauthClientSecret.trim();
  if (patch.webhookSecret !== undefined) conn.webhookSecret = patch.webhookSecret.trim();
  if (patch.accessToken !== undefined) conn.accessToken = patch.accessToken.trim();
  if (patch.refreshToken !== undefined) conn.refreshToken = patch.refreshToken.trim();
  if (patch.status !== undefined) {
    conn.status = patch.status;
  } else if (patch.accessToken !== undefined) {
    // Auto-derive status from accessToken presence
    conn.status = patch.accessToken.trim() ? "connected" : "disconnected";
  }
  conn.updatedAt = Date.now();

  persist();
  return conn;
}

export function deleteOAuthConnection(id: string): boolean {
  ensureLoaded();
  const idx = connections.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  connections.splice(idx, 1);
  persist();
  return true;
}

/** Sanitize an OAuth connection for API responses (mask secrets). */
export function sanitizeOAuthConnection(
  conn: LinearOAuthConnection,
): LinearOAuthConnectionSummary {
  return {
    id: conn.id,
    name: conn.name,
    oauthClientId: conn.oauthClientId,
    status: conn.status,
    hasAccessToken: !!conn.accessToken,
    hasClientSecret: !!conn.oauthClientSecret,
    hasWebhookSecret: !!conn.webhookSecret,
    createdAt: conn.createdAt,
    updatedAt: conn.updatedAt,
  };
}

/** Reset internal state and optionally set a custom file path (for testing). */
export function _resetForTest(customPath?: string): void {
  connections = [];
  loaded = false;
  filePath = customPath || DEFAULT_PATH;
}
