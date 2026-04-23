import { describe, it, expect, vi } from "vitest";
import { volumesToolDefinitions, handleVolumesTool } from "../../src/tools/volumes.js";

describe("synology_volume_list", () => {
  it("calls SYNO.Storage.CGI.Volume/list", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ volumes: [{ id: "volume_1" }] })) };
    const clientFor = vi.fn(async (h: string) => { expect(h).toBe("nas01"); return client as never; });
    const result = await handleVolumesTool("synology_volume_list", { host: "nas01" }, { clientFor } as never);
    expect(client.request).toHaveBeenCalledWith("SYNO.Storage.CGI.Volume", "list", { version: 1 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.volumes).toBeDefined();
  });

  it("requires host param", async () => {
    const clientFor = vi.fn();
    const result = await handleVolumesTool("synology_volume_list", {}, { clientFor } as never);
    expect(result.isError).toBe(true);
    expect(clientFor).not.toHaveBeenCalled();
  });
});

describe("synology_volume_status", () => {
  it("requires volume_path arg and calls get with it", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ volume: { status: "normal" } })) };
    const clientFor = vi.fn(async () => client as never);
    const result = await handleVolumesTool("synology_volume_status", { host: "nas01", volume_path: "/volume1" }, { clientFor } as never);
    expect(client.request).toHaveBeenCalledWith("SYNO.Storage.CGI.Volume", "get", { version: 1, volume_path: "/volume1" });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.volume).toBeDefined();
  });

  it("errors when volume_path missing", async () => {
    const clientFor = vi.fn();
    const result = await handleVolumesTool("synology_volume_status", { host: "nas01" }, { clientFor } as never);
    expect(result.isError).toBe(true);
  });

  it("errors when host missing", async () => {
    const clientFor = vi.fn();
    const result = await handleVolumesTool("synology_volume_status", { volume_path: "/volume1" }, { clientFor } as never);
    expect(result.isError).toBe(true);
  });
});

describe("volumesToolDefinitions", () => {
  it("exposes both volume tool names", () => {
    const names = volumesToolDefinitions.map((t) => t.name);
    expect(names).toContain("synology_volume_list");
    expect(names).toContain("synology_volume_status");
  });

  it("rejects unknown tool names", async () => {
    const result = await handleVolumesTool("synology_bogus", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
