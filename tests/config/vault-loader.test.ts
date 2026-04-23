import { describe, it, expect, vi } from "vitest";
import { loadFromVault } from "../../src/config/vault-loader.js";

describe("loadFromVault", () => {
  it("silently no-ops when Vault env vars are not set", async () => {
    const env: NodeJS.ProcessEnv = {};
    const fetchMock = vi.fn();
    await loadFromVault({ kvPath: "whatever", mapping: { foo: "FOO" }, env, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(env["FOO"]).toBeUndefined();
  });

  it("populates env vars from Vault KV v2 on happy path", async () => {
    const env: NodeJS.ProcessEnv = {
      NAS_VAULT_ADDR: "https://vault.example.com",
      NAS_VAULT_ROLE_ID: "role-123",
      NAS_VAULT_SECRET_ID: "secret-abc",
    };
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.endsWith("/v1/auth/approle/login")) {
        return new Response(JSON.stringify({ auth: { client_token: "tok123" } }), { status: 200 });
      }
      if (u.endsWith("/v1/kv/data/myapp/config")) {
        return new Response(JSON.stringify({ data: { data: { url: "https://api.example.com", token: "t" } } }), { status: 200 });
      }
      return new Response("", { status: 404 });
    });
    await loadFromVault({
      kvPath: "myapp/config",
      mapping: { url: "MYAPP_URL", token: "MYAPP_TOKEN" },
      env,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    expect(env["MYAPP_URL"]).toBe("https://api.example.com");
    expect(env["MYAPP_TOKEN"]).toBe("t");
  });

  it("does not overwrite env vars already set (prefers existing)", async () => {
    const env: NodeJS.ProcessEnv = {
      NAS_VAULT_ADDR: "https://vault.example.com",
      NAS_VAULT_ROLE_ID: "r",
      NAS_VAULT_SECRET_ID: "s",
      MYAPP_URL: "https://existing.example.com",
    };
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.endsWith("/v1/auth/approle/login")) return new Response(JSON.stringify({ auth: { client_token: "t" } }), { status: 200 });
      if (u.endsWith("/v1/kv/data/myapp/config")) return new Response(JSON.stringify({ data: { data: { url: "https://vault.example.com/api" } } }), { status: 200 });
      return new Response("", { status: 404 });
    });
    await loadFromVault({ kvPath: "myapp/config", mapping: { url: "MYAPP_URL" }, env, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(env["MYAPP_URL"]).toBe("https://existing.example.com"); // unchanged
  });

  it("silently falls back when Vault login fails", async () => {
    const env: NodeJS.ProcessEnv = {
      NAS_VAULT_ADDR: "https://vault.example.com",
      NAS_VAULT_ROLE_ID: "r",
      NAS_VAULT_SECRET_ID: "s",
    };
    const fetchMock = vi.fn(async () => new Response("", { status: 403 }));
    await loadFromVault({ kvPath: "myapp/config", mapping: { url: "MYAPP_URL" }, env, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(env["MYAPP_URL"]).toBeUndefined();
  });

  it("silently falls back when KV read fails", async () => {
    const env: NodeJS.ProcessEnv = {
      NAS_VAULT_ADDR: "https://vault.example.com",
      NAS_VAULT_ROLE_ID: "r",
      NAS_VAULT_SECRET_ID: "s",
    };
    const fetchMock = vi.fn(async (url: string) => {
      if (url.toString().endsWith("/v1/auth/approle/login")) return new Response(JSON.stringify({ auth: { client_token: "t" } }), { status: 200 });
      return new Response("", { status: 404 });
    });
    await loadFromVault({ kvPath: "nonexistent/path", mapping: { url: "MYAPP_URL" }, env, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(env["MYAPP_URL"]).toBeUndefined();
  });
});
