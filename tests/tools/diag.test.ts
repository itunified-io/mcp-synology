import { describe, it, expect, vi } from "vitest";
import { diagToolDefinitions, handleDiagTool } from "../../src/tools/diag.js";

describe("synology_diag_disk_health", () => {
  it("calls SYNO.Storage.CGI.Storage/load_info and returns disks", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ disks: [{ id: "sata1", smart_status: "normal" }] })) };
    const result = await handleDiagTool("synology_diag_disk_health", { host: "nas01" }, { clientFor: async () => client as never });
    expect(client.request).toHaveBeenCalledWith("SYNO.Storage.CGI.Storage", "load_info", { version: 1 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.disks[0].id).toBe("sata1");
  });
});

describe("synology_diag_smart", () => {
  it("returns rolled-up smart_status from disks array", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ disks: [{ id: "sata1", smart_status: "normal", temp: 30, model: "X", serial: "Y" }] })) };
    const result = await handleDiagTool("synology_diag_smart", { host: "nas01" }, { clientFor: async () => client as never });
    expect(client.request).toHaveBeenCalledWith("SYNO.Storage.CGI.Storage", "load_info", { version: 1 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.smart_summary).toHaveLength(1);
    expect(parsed.smart_summary[0].smart_status).toBe("normal");
  });
});

describe("synology_diag_log_tail", () => {
  it("defaults lines to 100", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ items: [] })) };
    await handleDiagTool("synology_diag_log_tail", { host: "nas01" }, { clientFor: async () => client as never });
    const [, , params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(params.lines).toBe(100);
  });

  it("honors explicit lines", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ items: [] })) };
    await handleDiagTool("synology_diag_log_tail", { host: "nas01", lines: 500 }, { clientFor: async () => client as never });
    const [, , params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(params.lines).toBe(500);
  });
});

describe("diagToolDefinitions", () => {
  it("rejects unknown tool names", async () => {
    const result = await handleDiagTool("synology_bogus", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
