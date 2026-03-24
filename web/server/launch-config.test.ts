import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  loadLaunchConfig,
  validateConfig,
  resolveForContext,
  buildStartupOrder,
  type LaunchConfig,
  type ResolvedService,
} from "./launch-config.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), "launch-config-test-"));
}

function writeLaunchConfig(cwd: string, config: Record<string, unknown>): void {
  const dir = join(cwd, ".companion");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "launch.json"), JSON.stringify(config, null, 2));
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("launch-config", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // -- loadLaunchConfig --

  describe("loadLaunchConfig", () => {
    test("returns null when no .companion/launch.json exists", () => {
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("loads valid config from cwd", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        setup: [{ name: "Install", command: "npm install" }],
      });
      const config = loadLaunchConfig(tmpDir);
      expect(config).not.toBeNull();
      expect(config!.version).toBe("0.0.1");
      expect(config!.setup).toHaveLength(1);
    });

    test("falls back to repoRoot for worktree sessions", () => {
      const repoRoot = makeTmpDir();
      writeLaunchConfig(repoRoot, {
        version: "0.0.1",
        services: { web: { command: "npm run dev" } },
      });
      // tmpDir (worktree) has no launch.json
      const config = loadLaunchConfig(tmpDir, repoRoot);
      expect(config).not.toBeNull();
      expect(config!.services).toHaveProperty("web");
      rmSync(repoRoot, { recursive: true, force: true });
    });

    test("prefers cwd over repoRoot", () => {
      const repoRoot = makeTmpDir();
      writeLaunchConfig(repoRoot, {
        version: "0.0.1",
        setup: [{ name: "Root", command: "echo root" }],
      });
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        setup: [{ name: "Worktree", command: "echo worktree" }],
      });
      const config = loadLaunchConfig(tmpDir, repoRoot);
      expect(config!.setup![0].name).toBe("Worktree");
      rmSync(repoRoot, { recursive: true, force: true });
    });

    test("returns null for invalid JSON", () => {
      const dir = join(tmpDir, ".companion");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "launch.json"), "{ not valid json }");
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("returns null when version is missing", () => {
      writeLaunchConfig(tmpDir, {
        setup: [{ name: "Install", command: "npm install" }],
      });
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });
  });

  // -- Validation --

  describe("validation", () => {
    test("rejects setup without name", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        setup: [{ command: "npm install" }],
      });
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("rejects setup without command", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        setup: [{ name: "Install" }],
      });
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("rejects service without command", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        services: { web: { readyPattern: "ready" } },
      });
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("rejects invalid dependsOn condition", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        services: {
          db: { command: "start-db" },
          web: { command: "npm run dev", dependsOn: { db: "healthy" } },
        },
      });
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("rejects dependsOn ready without readyPattern on dependency", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        services: {
          db: { command: "start-db" },
          web: { command: "npm run dev", dependsOn: { db: "ready" } },
        },
      });
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("accepts dependsOn ready when dependency has readyPattern", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        services: {
          db: { command: "start-db", readyPattern: "accepting connections" },
          web: { command: "npm run dev", dependsOn: { db: "ready" } },
        },
      });
      expect(loadLaunchConfig(tmpDir)).not.toBeNull();
    });

    test("rejects invalid port number", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        ports: { abc: { label: "App" } },
      });
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("rejects port without label", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        ports: { "3000": { openOnReady: true } },
      });
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("rejects invalid protocol", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        ports: { "3000": { label: "App", protocol: "udp" } },
      });
      expect(loadLaunchConfig(tmpDir)).toBeNull();
    });

    test("validateConfig collects all errors in one pass", () => {
      // Config has multiple issues: missing version, invalid port, service without command
      const result = validateConfig({
        services: { broken: { readyPattern: "ready" } },
        ports: { abc: { label: "App" }, "3000": {} },
      });
      expect(result.valid).toBe(false);
      // Should collect at least 3 distinct errors (version, service command, port number, port label)
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
      expect(result.errors.some((e) => e.includes("version"))).toBe(true);
      expect(result.errors.some((e) => e.includes("broken"))).toBe(true);
      expect(result.errors.some((e) => e.includes("abc"))).toBe(true);
    });

    test("accepts valid complete config", () => {
      writeLaunchConfig(tmpDir, {
        version: "0.0.1",
        setup: [{ name: "Install", command: "bun install" }],
        services: {
          db: { command: "docker compose up postgres", readyPattern: "ready", conditions: { local: true } },
          api: { command: "bun run dev:api", dependsOn: { db: "ready" }, readyPattern: "listening" },
          web: { command: "bun run dev:vite", dependsOn: { api: "started" } },
        },
        ports: {
          "3000": { label: "App", openOnReady: true, healthCheck: { path: "/" } },
          "5432": { label: "Postgres", protocol: "tcp" },
        },
      });
      expect(loadLaunchConfig(tmpDir)).not.toBeNull();
    });
  });

  // -- resolveForContext --

  describe("resolveForContext", () => {
    const fullConfig: LaunchConfig = {
      version: "0.0.1",
      setup: [
        { name: "Install", command: "bun install" },
        { name: "Sandbox only", command: "apt install -y foo", conditions: { sandbox: true } },
        { name: "Local only", command: "brew install bar", conditions: { local: true } },
      ],
      services: {
        db: { command: "start-db", readyPattern: "ready", conditions: { local: true } },
        api: { command: "bun dev:api", dependsOn: { db: "ready" }, readyPattern: "listening" },
        "api-sandbox": { command: "npm dev:api", readyPattern: "listening", conditions: { sandbox: true } },
        web: { command: "bun dev:vite", dependsOn: { api: "started" } },
      },
      ports: {
        "3000": { label: "App", openOnReady: true },
        "5432": { label: "Postgres", protocol: "tcp" },
      },
    };

    test("filters setup scripts for local context", () => {
      const resolved = resolveForContext(fullConfig, { isSandbox: false, isWorktree: false });
      expect(resolved.setup).toHaveLength(2);
      expect(resolved.setup.map((s) => s.name)).toEqual(["Install", "Local only"]);
    });

    test("filters setup scripts for sandbox context", () => {
      const resolved = resolveForContext(fullConfig, { isSandbox: true, isWorktree: false });
      expect(resolved.setup).toHaveLength(2);
      expect(resolved.setup.map((s) => s.name)).toEqual(["Install", "Sandbox only"]);
    });

    test("filters services for local context and keeps deps", () => {
      const resolved = resolveForContext(fullConfig, { isSandbox: false, isWorktree: false });
      const serviceNames = Object.keys(resolved.services);
      expect(serviceNames).toContain("db");
      expect(serviceNames).toContain("api");
      expect(serviceNames).toContain("web");
      expect(serviceNames).not.toContain("api-sandbox");
      // api still depends on db
      expect(resolved.services.api.dependsOn).toEqual({ db: "ready" });
    });

    test("prunes dependsOn when dependency is filtered out", () => {
      // In sandbox context, 'db' is filtered out (local only)
      const resolved = resolveForContext(fullConfig, { isSandbox: true, isWorktree: false });
      expect(resolved.services).not.toHaveProperty("db");
      // api's dependsOn db should be pruned
      expect(resolved.services.api.dependsOn).toEqual({});
    });

    test("ports are always included regardless of context", () => {
      const resolved = resolveForContext(fullConfig, { isSandbox: true, isWorktree: false });
      expect(Object.keys(resolved.ports)).toEqual(["3000", "5432"]);
    });

    test("applies default readyTimeout of 60", () => {
      const resolved = resolveForContext(fullConfig, { isSandbox: false, isWorktree: false });
      expect(resolved.services.db.readyTimeout).toBe(60);
    });

    test("handles config with no setup or services", () => {
      const minimal: LaunchConfig = { version: "0.0.1" };
      const resolved = resolveForContext(minimal, { isSandbox: false, isWorktree: false });
      expect(resolved.setup).toEqual([]);
      expect(resolved.services).toEqual({});
      expect(resolved.ports).toEqual({});
    });
  });

  // -- buildStartupOrder --

  describe("buildStartupOrder", () => {
    test("single service with no deps → one wave", () => {
      const services: Record<string, ResolvedService> = {
        web: { name: "web", command: "npm dev", dependsOn: {}, readyTimeout: 60 },
      };
      expect(buildStartupOrder(services)).toEqual([["web"]]);
    });

    test("independent services → single wave with all", () => {
      const services: Record<string, ResolvedService> = {
        web: { name: "web", command: "npm dev", dependsOn: {}, readyTimeout: 60 },
        api: { name: "api", command: "npm api", dependsOn: {}, readyTimeout: 60 },
      };
      const waves = buildStartupOrder(services);
      expect(waves).toHaveLength(1);
      expect(waves[0].sort()).toEqual(["api", "web"]);
    });

    test("linear chain → sequential waves", () => {
      const services: Record<string, ResolvedService> = {
        db: { name: "db", command: "start-db", dependsOn: {}, readyPattern: "ready", readyTimeout: 60 },
        api: { name: "api", command: "start-api", dependsOn: { db: "ready" }, readyPattern: "listening", readyTimeout: 60 },
        web: { name: "web", command: "start-web", dependsOn: { api: "started" }, readyTimeout: 60 },
      };
      const waves = buildStartupOrder(services);
      expect(waves).toEqual([["db"], ["api"], ["web"]]);
    });

    test("diamond dependency → correct wave grouping", () => {
      // db → api, db → worker, then app depends on both api and worker
      const services: Record<string, ResolvedService> = {
        db: { name: "db", command: "start-db", dependsOn: {}, readyPattern: "ready", readyTimeout: 60 },
        api: { name: "api", command: "start-api", dependsOn: { db: "ready" }, readyTimeout: 60 },
        worker: { name: "worker", command: "start-worker", dependsOn: { db: "ready" }, readyTimeout: 60 },
        app: { name: "app", command: "start-app", dependsOn: { api: "started", worker: "started" }, readyTimeout: 60 },
      };
      const waves = buildStartupOrder(services);
      expect(waves).toHaveLength(3);
      expect(waves[0]).toEqual(["db"]);
      expect(waves[1].sort()).toEqual(["api", "worker"]);
      expect(waves[2]).toEqual(["app"]);
    });

    test("circular dependency → throws", () => {
      const services: Record<string, ResolvedService> = {
        a: { name: "a", command: "start-a", dependsOn: { b: "started" }, readyTimeout: 60 },
        b: { name: "b", command: "start-b", dependsOn: { a: "started" }, readyTimeout: 60 },
      };
      expect(() => buildStartupOrder(services)).toThrow(/Circular dependency/);
    });

    test("three-way circular → throws with all names", () => {
      const services: Record<string, ResolvedService> = {
        a: { name: "a", command: "a", dependsOn: { c: "started" }, readyTimeout: 60 },
        b: { name: "b", command: "b", dependsOn: { a: "started" }, readyTimeout: 60 },
        c: { name: "c", command: "c", dependsOn: { b: "started" }, readyTimeout: 60 },
      };
      expect(() => buildStartupOrder(services)).toThrow(/a, b, c/);
    });

    test("empty services → empty waves", () => {
      expect(buildStartupOrder({})).toEqual([]);
    });
  });
});
