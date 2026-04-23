import { describe, it, expect, vi } from "vitest";
import { diagToolDefinitions, handleDiagTool } from "../../src/tools/diag.js";

describe("synology_diag_disk_health", () => {
  it("calls HddMan/load_all_disk_list", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ disks: [] })) };
    await handleDiagTool("synology_diag_disk_health", { host: "nas01" }, { clientFor: async () => client as never });
    const [api, method] = client.request.mock.calls[0] as [string, string];
    expect(api).toBe("SYNO.Storage.CGI.HddMan");
    expect(method).toBe("load_all_disk_list");
  });
});

describe("synology_diag_smart", () => {
  it("calls Smart/list version=2", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ smart: [] })) };
    await handleDiagTool("synology_diag_smart", { host: "nas01" }, { clientFor: async () => client as never });
    const [api, method, params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(api).toBe("SYNO.Storage.CGI.Smart");
    expect(params.version).toBe(2);
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
