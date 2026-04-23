import { describe, it, expect, vi } from "vitest";
import { hostsToolDefinitions, handleHostsTool } from "../../src/tools/hosts.js";

describe("synology_host_list", () => {
  it("returns the registry's listHosts result as JSON", async () => {
    const registry = { listHosts: vi.fn(async () => ["nas01", "nas02"]) };
    const result = await handleHostsTool("synology_host_list", {}, { registry } as never);
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toEqual(["nas01", "nas02"]);
  });

  it("declares a tool with name synology_host_list", () => {
    const names = hostsToolDefinitions.map((t) => t.name);
    expect(names).toContain("synology_host_list");
  });

  it("rejects unknown tool names with isError", async () => {
    const registry = { listHosts: vi.fn() };
    const result = await handleHostsTool("synology_bogus", {}, { registry } as never);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown tool");
  });
});
