import { describe, it, expect, vi } from "vitest";
import { systemToolDefinitions, handleSystemTool } from "../../src/tools/system.js";

describe("synology_system_info", () => {
  it("calls DSM SYNO.Core.System/info and returns result", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ model: "DS1621+", version: "7.2.1-69057" })) };
    const clientFor = vi.fn(async (h: string) => { expect(h).toBe("nas01"); return client as never; });
    const result = await handleSystemTool("synology_system_info", { host: "nas01" }, { clientFor } as never);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.model).toBe("DS1621+");
    expect(client.request).toHaveBeenCalledWith("SYNO.Core.System", "info", { version: 1 });
  });

  it("requires host param", async () => {
    const clientFor = vi.fn();
    const result = await handleSystemTool("synology_system_info", {}, { clientFor } as never);
    expect(result.isError).toBe(true);
    expect(clientFor).not.toHaveBeenCalled();
  });
});

describe("synology_system_update_status", () => {
  it("calls SYNO.Core.Upgrade.Server/check", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ update: { available: true, version: "7.2.2" } })) };
    const clientFor = vi.fn(async () => client as never);
    const result = await handleSystemTool("synology_system_update_status", { host: "nas01" }, { clientFor } as never);
    expect(client.request).toHaveBeenCalledWith("SYNO.Core.Upgrade.Server", "check", { version: 1 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.update.available).toBe(true);
  });

  it("requires host param", async () => {
    const clientFor = vi.fn();
    const result = await handleSystemTool("synology_system_update_status", {}, { clientFor } as never);
    expect(result.isError).toBe(true);
  });
});

describe("systemToolDefinitions", () => {
  it("exposes both system tool names", () => {
    const names = systemToolDefinitions.map((t) => t.name);
    expect(names).toContain("synology_system_info");
    expect(names).toContain("synology_system_update_status");
  });

  it("rejects unknown tool names", async () => {
    const result = await handleSystemTool("synology_bogus", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
