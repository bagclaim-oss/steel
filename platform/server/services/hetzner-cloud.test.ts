import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HetznerCloudClient } from "./hetzner-cloud";

describe("HetznerCloudClient", () => {
  const TOKEN = "hcloud-test-token";
  let fetchMock: ReturnType<typeof vi.fn>;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;
  });

  afterEach(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it("creates a volume with bearer auth and returns parsed payload", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ volume: { id: 42, name: "data", size: 100 } }),
    });

    const client = new HetznerCloudClient(TOKEN);
    const volume = await client.createVolume({ name: "data", size: 100, location: "ash" });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.hetzner.cloud/v1/volumes",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(volume).toEqual({ id: 42, name: "data", size: 100 });
  });

  it("throws a useful error body when api call fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => '{"error":"invalid token"}',
    });

    const client = new HetznerCloudClient(TOKEN);

    await expect(client.getServer("1")).rejects.toThrow(
      "Hetzner API GET /servers/1 failed (401)",
    );
  });
});
