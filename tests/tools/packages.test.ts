import { describe, it, expect, vi } from "vitest";
import { packagesToolDefinitions, handlePackagesTool } from "../../src/tools/packages.js";

describe("synology_package_list", () => {
  it("calls SYNO.Core.Package/list version=2", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ packages: [{ id: "ScsiTarget" }] })) };
    await handlePackagesTool("synology_package_list", { host: "nas01" }, { clientFor: async () => client as never });
    const [api, method, params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(api).toBe("SYNO.Core.Package");
    expect(method).toBe("list");
    expect(params.version).toBe(2);
  });

  it("rejects unknown tool names", async () => {
    const result = await handlePackagesTool("synology_bogus", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
