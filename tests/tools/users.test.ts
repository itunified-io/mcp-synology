import { describe, it, expect, vi } from "vitest";
import { usersToolDefinitions, handleUsersTool } from "../../src/tools/users.js";

describe("synology_user_list", () => {
  it("calls SYNO.Core.User/list with offset=0 limit=-1", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ users: [{ name: "itsec" }] })) };
    await handleUsersTool("synology_user_list", { host: "nas01" }, { clientFor: async () => client as never });
    const [, , params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(params.offset).toBe(0);
    expect(params.limit).toBe(-1);
  });
});

describe("synology_group_list", () => {
  it("calls SYNO.Core.Group/list", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ groups: [] })) };
    await handleUsersTool("synology_group_list", { host: "nas01" }, { clientFor: async () => client as never });
    const [api] = client.request.mock.calls[0] as [string];
    expect(api).toBe("SYNO.Core.Group");
  });
});

describe("usersToolDefinitions", () => {
  it("declares 2 tools", () => {
    const names = usersToolDefinitions.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["synology_user_list", "synology_group_list"]));
  });
  it("rejects unknown tool names", async () => {
    const result = await handleUsersTool("synology_bogus", { host: "nas01" }, { clientFor: vi.fn() } as never);
    expect(result.isError).toBe(true);
  });
});
