import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  let log: typeof import("./logger.js").log;
  const originalEnv = process.env.COMPANION_LOG_FORMAT;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.COMPANION_LOG_FORMAT;
    } else {
      process.env.COMPANION_LOG_FORMAT = originalEnv;
    }
  });

  describe("human-readable format (default)", () => {
    beforeEach(async () => {
      delete process.env.COMPANION_LOG_FORMAT;
      const mod = await import("./logger.js");
      log = mod.log;
    });

    it("formats info messages with bracket prefix", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      log.info("ws-bridge", "Browser connected", { sessionId: "abc-123", browsers: 3 });
      expect(spy).toHaveBeenCalledOnce();
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain("[ws-bridge]");
      expect(output).toContain("Browser connected");
      expect(output).toContain("sessionId=abc-123");
      expect(output).toContain("browsers=3");
      spy.mockRestore();
    });

    it("formats warn messages", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      log.warn("orchestrator", "Relaunch limit reached", { sessionId: "s1" });
      expect(spy).toHaveBeenCalledOnce();
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain("[orchestrator]");
      expect(output).toContain("Relaunch limit reached");
      spy.mockRestore();
    });

    it("formats error messages", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      log.error("cli-launcher", "Process crashed", { exitCode: 1 });
      expect(spy).toHaveBeenCalledOnce();
      const output = spy.mock.calls[0][0] as string;
      expect(output).toContain("[cli-launcher]");
      expect(output).toContain("exitCode=1");
      spy.mockRestore();
    });

    it("handles messages without data", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      log.info("server", "Started");
      const output = spy.mock.calls[0][0] as string;
      expect(output).toBe("[server] Started");
      spy.mockRestore();
    });
  });

  describe("JSON format (COMPANION_LOG_FORMAT=json)", () => {
    beforeEach(async () => {
      process.env.COMPANION_LOG_FORMAT = "json";
      const mod = await import("./logger.js");
      log = mod.log;
    });

    it("outputs valid JSON with required fields", () => {
      const spy = vi.spyOn(console, "log").mockImplementation(() => {});
      log.info("ws-bridge", "CLI connected", { sessionId: "s1" });
      const output = spy.mock.calls[0][0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.level).toBe("info");
      expect(parsed.module).toBe("ws-bridge");
      expect(parsed.msg).toBe("CLI connected");
      expect(parsed.sessionId).toBe("s1");
      expect(parsed.ts).toBeDefined();
      spy.mockRestore();
    });
  });
});
