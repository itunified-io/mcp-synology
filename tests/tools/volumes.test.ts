import { describe, it, expect, vi } from "vitest";
import { volumesToolDefinitions, handleVolumesTool } from "../../src/tools/volumes.js";

describe("synology_volume_list", () => {
  it("calls SYNO.Storage.CGI.Storage/load_info and returns pools", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ detected_pools: [{ pool_path: "/volume1", status: "normal" }], missing_pools: [], overview_data: { total_size: 1 } })) };
    const result = await handleVolumesTool("synology_volume_list", { host: "nas01" }, { clientFor: async () => client as never });
    expect(client.request).toHaveBeenCalledWith("SYNO.Storage.CGI.Storage", "load_info", { version: 1 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.pools).toHaveLength(1);
    expect(parsed.pools[0].pool_path).toBe("/volume1");
  });
});

describe("synology_volume_status", () => {
  it("filters detected_pools by volume_path", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ detected_pools: [{ pool_path: "/volume1", status: "normal" }, { pool_path: "/volume2", status: "degraded" }] })) };
    const result = await handleVolumesTool("synology_volume_status", { host: "nas01", volume_path: "/volume2" }, { clientFor: async () => client as never });
    expect(client.request).toHaveBeenCalledWith("SYNO.Storage.CGI.Storage", "load_info", { version: 1 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("degraded");
  });

  it("returns isError when volume_path not found", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ detected_pools: [{ pool_path: "/volume1" }] })) };
    const result = await handleVolumesTool("synology_volume_status", { host: "nas01", volume_path: "/nope" }, { clientFor: async () => client as never });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not found");
  });

  it("errors when volume_path missing", async () => {
    const result = await handleVolumesTool("synology_volume_status", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});

describe("volumesToolDefinitions", () => {
  it("rejects unknown tool names", async () => {
    const result = await handleVolumesTool("synology_bogus", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
