import { describe, it, expect, vi } from "vitest";
import { iscsiToolDefinitions, handleIscsiTool } from "../../src/tools/iscsi.js";

describe("synology_iscsi_target_list", () => {
  it("calls SYNO.Core.ISCSI.Target/list", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ targets: [{ iqn: "iqn.1" }] })) };
    await handleIscsiTool("synology_iscsi_target_list", { host: "nas01" }, { clientFor: async () => client as never });
    const [api, method] = client.request.mock.calls[0] as [string, string];
    expect(api).toBe("SYNO.Core.ISCSI.Target");
    expect(method).toBe("list");
  });
});

describe("synology_iscsi_lun_list", () => {
  it("calls SYNO.Core.ISCSI.LUN/list", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ luns: [] })) };
    await handleIscsiTool("synology_iscsi_lun_list", { host: "nas01" }, { clientFor: async () => client as never });
    const [api] = client.request.mock.calls[0] as [string];
    expect(api).toBe("SYNO.Core.ISCSI.LUN");
  });
});

describe("synology_iscsi_initiator_acl_list", () => {
  it("calls ISCSI.Target/list with additional=[allowed_hosts]", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ targets: [] })) };
    await handleIscsiTool("synology_iscsi_initiator_acl_list", { host: "nas01" }, { clientFor: async () => client as never });
    const [api, method, params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(api).toBe("SYNO.Core.ISCSI.Target");
    expect(method).toBe("list");
    expect((params.additional as string[]) || JSON.parse(params.additional as string)).toContain("allowed_hosts");
  });
});

describe("iscsiToolDefinitions", () => {
  it("rejects unknown tool names", async () => {
    const result = await handleIscsiTool("synology_bogus", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
