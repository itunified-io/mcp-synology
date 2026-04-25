import { describe, it, expect, vi } from "vitest";
import { networkToolDefinitions, handleNetworkTool } from "../../src/tools/network.js";

describe("synology_network_interfaces", () => {
  it("calls SYNO.Core.Network.Interface/list", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ ifaces: [{ name: "eth0" }] })) };
    const result = await handleNetworkTool("synology_network_interfaces", { host: "nas01" }, { clientFor: async () => client as never });
    expect(client.request).toHaveBeenCalledWith("SYNO.Core.Network.Interface", "list", { version: 1 });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ifaces[0].name).toBe("eth0");
  });
});

describe("synology_network_routes", () => {
  it("calls SYNO.Core.Network/get v2", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ gateway: "10.10.0.1", dns_primary: "10.10.0.1" })) };
    await handleNetworkTool("synology_network_routes", { host: "nas01" }, { clientFor: async () => client as never });
    expect(client.request).toHaveBeenCalledWith("SYNO.Core.Network", "get", { version: 2 });
  });
});

describe("networkToolDefinitions", () => {
  it("declares 2 tools", () => {
    const names = networkToolDefinitions.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["synology_network_interfaces", "synology_network_routes"]));
  });

  it("rejects unknown tool names", async () => {
    const result = await handleNetworkTool("synology_bogus", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
