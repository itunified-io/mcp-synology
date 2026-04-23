import { describe, it, expect, vi } from "vitest";
import { snapshotsToolDefinitions, handleSnapshotsTool } from "../../src/tools/snapshots.js";

describe("synology_snapshot_list", () => {
  it("requires host + share args and calls Share.Snapshot/list", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ snapshots: [] })) };
    await handleSnapshotsTool("synology_snapshot_list", { host: "nas01", share: "proxmox" }, { clientFor: async () => client as never });
    const [api, method, params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(api).toBe("SYNO.Core.Share.Snapshot");
    expect(method).toBe("list");
    expect(params.name).toBe("proxmox");
  });

  it("errors on missing share", async () => {
    const result = await handleSnapshotsTool("synology_snapshot_list", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });

  it("rejects unknown tool names", async () => {
    const result = await handleSnapshotsTool("synology_bogus", { host: "nas01", share: "x" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
