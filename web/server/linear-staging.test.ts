import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Redirect COMPANION_HOME to a temp directory so tests don't touch real config
const TEST_HOME = join(tmpdir(), `linear-staging-test-${Date.now()}`);
process.env.COMPANION_HOME = TEST_HOME;

// Import after setting env var so the module picks up the test directory
const staging = await import("./linear-staging.js");

describe("linear-staging", () => {
  beforeEach(() => {
    mkdirSync(TEST_HOME, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(TEST_HOME, { recursive: true, force: true });
    } catch { /* ok */ }
  });

  describe("createSlot", () => {
    it("creates a slot and returns a hex ID", () => {
      const id = staging.createSlot({
        clientId: "cid",
        clientSecret: "csecret",
        webhookSecret: "wsecret",
      });
      expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it("creates the staging directory and JSON file", () => {
      const id = staging.createSlot({
        clientId: "cid",
        clientSecret: "csecret",
        webhookSecret: "wsecret",
      });
      const files = readdirSync(join(TEST_HOME, "staging"));
      expect(files).toContain(`${id}.json`);
    });
  });

  describe("getSlot", () => {
    it("returns the slot with matching credentials", () => {
      const id = staging.createSlot({
        clientId: "my-client",
        clientSecret: "my-secret",
        webhookSecret: "my-webhook",
      });
      const slot = staging.getSlot(id);
      expect(slot).not.toBeNull();
      expect(slot!.clientId).toBe("my-client");
      expect(slot!.clientSecret).toBe("my-secret");
      expect(slot!.webhookSecret).toBe("my-webhook");
      expect(slot!.accessToken).toBe("");
      expect(slot!.refreshToken).toBe("");
    });

    it("returns null for a non-existent slot", () => {
      expect(staging.getSlot("nonexistent")).toBeNull();
    });
  });

  describe("updateSlotTokens", () => {
    it("updates the access and refresh tokens", () => {
      const id = staging.createSlot({
        clientId: "cid",
        clientSecret: "csecret",
        webhookSecret: "wsecret",
      });

      const updated = staging.updateSlotTokens(id, {
        accessToken: "at_123",
        refreshToken: "rt_456",
      });
      expect(updated).toBe(true);

      const slot = staging.getSlot(id);
      expect(slot!.accessToken).toBe("at_123");
      expect(slot!.refreshToken).toBe("rt_456");
      // Original credentials are preserved
      expect(slot!.clientId).toBe("cid");
    });

    it("returns false for a non-existent slot", () => {
      expect(staging.updateSlotTokens("nope", { accessToken: "a", refreshToken: "r" })).toBe(false);
    });
  });

  describe("consumeSlot", () => {
    it("returns the slot and deletes it", () => {
      const id = staging.createSlot({
        clientId: "cid",
        clientSecret: "csecret",
        webhookSecret: "wsecret",
      });

      const slot = staging.consumeSlot(id);
      expect(slot).not.toBeNull();
      expect(slot!.clientId).toBe("cid");

      // Slot is gone after consuming
      expect(staging.getSlot(id)).toBeNull();
    });

    it("returns null for a non-existent slot", () => {
      expect(staging.consumeSlot("nonexistent")).toBeNull();
    });
  });

  describe("deleteSlot", () => {
    it("deletes an existing slot", () => {
      const id = staging.createSlot({
        clientId: "cid",
        clientSecret: "csecret",
        webhookSecret: "wsecret",
      });
      expect(staging.deleteSlot(id)).toBe(true);
      expect(staging.getSlot(id)).toBeNull();
    });

    it("returns false for a non-existent slot", () => {
      expect(staging.deleteSlot("nonexistent")).toBe(false);
    });
  });

  describe("multiple slots", () => {
    it("supports multiple concurrent staging slots", () => {
      // Validates that multiple wizards can run in parallel
      const id1 = staging.createSlot({
        clientId: "client-A",
        clientSecret: "secret-A",
        webhookSecret: "webhook-A",
      });
      const id2 = staging.createSlot({
        clientId: "client-B",
        clientSecret: "secret-B",
        webhookSecret: "webhook-B",
      });

      expect(id1).not.toBe(id2);

      const slot1 = staging.getSlot(id1);
      const slot2 = staging.getSlot(id2);
      expect(slot1!.clientId).toBe("client-A");
      expect(slot2!.clientId).toBe("client-B");

      // Consuming one doesn't affect the other
      staging.consumeSlot(id1);
      expect(staging.getSlot(id1)).toBeNull();
      expect(staging.getSlot(id2)).not.toBeNull();
    });
  });
});
