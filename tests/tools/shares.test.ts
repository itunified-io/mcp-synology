import { describe, it, expect, vi } from "vitest";
import { sharesToolDefinitions, handleSharesTool } from "../../src/tools/shares.js";

describe("synology_share_list", () => {
  it("calls SYNO.Core.Share/list with additional fields", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ shares: [{ name: "proxmox" }] })) };
    await handleSharesTool("synology_share_list", { host: "nas01" }, { clientFor: async () => client as never });
    const [api, method, params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(api).toBe("SYNO.Core.Share");
    expect(method).toBe("list");
    expect(params.version).toBe(1);
  });
});

describe("synology_share_permissions_get", () => {
  it("requires name param and calls permissions/list", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ items: [] })) };
    await handleSharesTool("synology_share_permissions_get", { host: "nas01", name: "proxmox" }, { clientFor: async () => client as never });
    const [api, method, params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(api).toBe("SYNO.Core.Share.Permission");
    expect(method).toBe("list");
    expect(params.name).toBe("proxmox");
  });

  it("errors when name missing", async () => {
    const result = await handleSharesTool("synology_share_permissions_get", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});

describe("sharesToolDefinitions", () => {
  it("rejects unknown tool names", async () => {
    const result = await handleSharesTool("synology_bogus", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
