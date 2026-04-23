import { describe, it, expect, vi } from "vitest";
import { HostRegistry, type HostCredentials } from "../../src/config/host-registry.js";

describe("HostRegistry", () => {
  it("lists hosts by enumerating kv/network/hosts/* with services/dsm-api", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/auth/approle/login")) {
        return new Response(JSON.stringify({ auth: { client_token: "t1" } }), { status: 200 });
      }
      if (url.endsWith("/v1/kv/metadata/network/hosts?list=true")) {
        return new Response(JSON.stringify({ data: { keys: ["nas01/", "nas02/"] } }), { status: 200 });
      }
      if (url.endsWith("/v1/kv/data/network/hosts/nas01/services/dsm-api")) {
        return new Response(JSON.stringify({ data: { data: { url: "https://nas01:5001", username: "itsec", password: "p" } } }), { status: 200 });
      }
      if (url.endsWith("/v1/kv/data/network/hosts/nas02/services/dsm-api")) {
        return new Response(JSON.stringify({ data: { data: { url: "https://nas02:5001", username: "itsec", password: "p" } } }), { status: 200 });
      }
      return new Response("", { status: 404 });
    });
    const registry = new HostRegistry({
      vaultAddr: "https://vault",
      roleId: "r",
      secretId: "s",
      mount: "kv",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const hosts = await registry.listHosts();
    expect(hosts).toEqual(["nas01", "nas02"]);
    const creds: HostCredentials = await registry.getCredentials("nas01");
    expect(creds.url).toBe("https://nas01:5001");
    expect(creds.username).toBe("itsec");
  });

  it("skips hosts without services/dsm-api entry", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/v1/auth/approle/login")) return new Response(JSON.stringify({ auth: { client_token: "t" } }), { status: 200 });
      if (url.endsWith("/v1/kv/metadata/network/hosts?list=true")) return new Response(JSON.stringify({ data: { keys: ["nas01/", "proximo01/"] } }), { status: 200 });
      if (url.endsWith("/v1/kv/data/network/hosts/nas01/services/dsm-api")) return new Response(JSON.stringify({ data: { data: { url: "u", username: "itsec", password: "p" } } }), { status: 200 });
      if (url.endsWith("/v1/kv/data/network/hosts/proximo01/services/dsm-api")) return new Response("", { status: 404 });
      return new Response("", { status: 404 });
    });
    const registry = new HostRegistry({ vaultAddr: "https://vault", roleId: "r", secretId: "s", mount: "kv", fetchImpl: fetchMock as unknown as typeof fetch });
    const hosts = await registry.listHosts();
    expect(hosts).toEqual(["nas01"]);
  });
});
