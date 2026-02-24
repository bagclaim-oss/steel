import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createToken, verifyToken } from "./managed-auth.js";

const TEST_SECRET = "test-secret-key-for-hmac-256-signing";

describe("managed-auth token utilities", () => {
  describe("createToken + verifyToken", () => {
    it("creates a valid token that can be verified", async () => {
      const token = await createToken(TEST_SECRET, 60);
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(2);

      const valid = await verifyToken(token, TEST_SECRET);
      expect(valid).toBe(true);
    });

    it("rejects tokens signed with a different secret", async () => {
      const token = await createToken(TEST_SECRET, 60);
      const valid = await verifyToken(token, "wrong-secret");
      expect(valid).toBe(false);
    });

    it("rejects expired tokens", async () => {
      // Create a token that expires in -1 seconds (already expired)
      const token = await createToken(TEST_SECRET, -1);
      const valid = await verifyToken(token, TEST_SECRET);
      expect(valid).toBe(false);
    });

    it("rejects malformed tokens", async () => {
      expect(await verifyToken("not-a-token", TEST_SECRET)).toBe(false);
      expect(await verifyToken("a.b.c", TEST_SECRET)).toBe(false);
      expect(await verifyToken("", TEST_SECRET)).toBe(false);
    });

    it("rejects tokens with tampered payload", async () => {
      const token = await createToken(TEST_SECRET, 60);
      const [, sig] = token.split(".");
      // Replace payload with different data
      const tamperedPayload = btoa(JSON.stringify({ exp: 9999999999 }))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
      const valid = await verifyToken(`${tamperedPayload}.${sig}`, TEST_SECRET);
      expect(valid).toBe(false);
    });
  });
});

describe("managed-auth middleware", () => {
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    savedEnv.COMPANION_AUTH_ENABLED = process.env.COMPANION_AUTH_ENABLED;
    savedEnv.COMPANION_AUTH_SECRET = process.env.COMPANION_AUTH_SECRET;
    savedEnv.COMPANION_LOGIN_URL = process.env.COMPANION_LOGIN_URL;
  });

  afterEach(() => {
    for (const [key, val] of Object.entries(savedEnv)) {
      if (val === undefined) delete process.env[key];
      else process.env[key] = val;
    }
  });

  it("passes through when COMPANION_AUTH_ENABLED is not set", async () => {
    delete process.env.COMPANION_AUTH_ENABLED;
    const { managedAuth } = await import("./managed-auth.js");

    // Simulate a minimal Hono context
    let nextCalled = false;
    const mockContext = {
      req: { path: "/api/sessions", header: () => undefined, query: () => undefined },
    } as Parameters<typeof managedAuth>[0];

    // The middleware should call next() immediately
    await managedAuth(mockContext, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it("bypasses auth for /health endpoint", async () => {
    process.env.COMPANION_AUTH_ENABLED = "1";
    process.env.COMPANION_AUTH_SECRET = TEST_SECRET;

    const { managedAuth } = await import("./managed-auth.js");

    let nextCalled = false;
    const mockContext = {
      req: { path: "/health", header: () => undefined, query: () => undefined },
    } as Parameters<typeof managedAuth>[0];

    await managedAuth(mockContext, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });

  it("bypasses auth for /ws/cli/ paths", async () => {
    process.env.COMPANION_AUTH_ENABLED = "1";
    process.env.COMPANION_AUTH_SECRET = TEST_SECRET;

    const { managedAuth } = await import("./managed-auth.js");

    let nextCalled = false;
    const mockContext = {
      req: {
        path: "/ws/cli/abc-123",
        header: () => undefined,
        query: () => undefined,
      },
    } as Parameters<typeof managedAuth>[0];

    await managedAuth(mockContext, async () => {
      nextCalled = true;
    });
    expect(nextCalled).toBe(true);
  });
});
