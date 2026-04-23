import { describe, it, expect, vi, beforeEach } from "vitest";
import { DsmClient } from "../../src/client/dsm-client.js";

const okJson = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200 });

describe("DsmClient", () => {
  beforeEach(() => { DsmClient.resetCache(); });

  it("logs in, stores SID cookie, sends it on subsequent requests", async () => {
    const calls: Array<{ url: string; headers?: Record<string, string> }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: url.toString(), headers: init?.headers as Record<string, string> });
      if (url.toString().includes("auth.cgi") && url.toString().includes("method=login")) {
        return okJson({ success: true, data: { sid: "SID123" } });
      }
      if (url.toString().includes("SYNO.Core.System") && url.toString().includes("method=info")) {
        return okJson({ success: true, data: { model: "DS1621+", serial: "ABC" } });
      }
      return okJson({ success: false, error: { code: 103 } });
    });
    const c = new DsmClient({
      hostname: "nas01",
      url: "https://nas01:5001",
      username: "itsec",
      password: "p",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const info = await c.request<{ model: string }>("SYNO.Core.System", "info", { version: 1 });
    expect(info.model).toBe("DS1621+");
    expect(calls[0]?.url).toContain("auth.cgi");
    expect(calls[1]?.headers?.["Cookie"]).toContain("id=SID123");
  });

  it("refreshes session on expired SID (error 106)", async () => {
    let loginCount = 0;
    let infoCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.includes("method=login")) { loginCount++; return okJson({ success: true, data: { sid: `SID${loginCount}` } }); }
      if (u.includes("method=info")) {
        infoCount++;
        if (infoCount === 1) return okJson({ success: false, error: { code: 106 } });
        return okJson({ success: true, data: { model: "DS1621+" } });
      }
      return okJson({ success: false, error: { code: 103 } });
    });
    const c = new DsmClient({ hostname: "nas01", url: "https://nas01:5001", username: "itsec", password: "p", fetchImpl: fetchMock as unknown as typeof fetch });
    const info = await c.request<{ model: string }>("SYNO.Core.System", "info", { version: 1 });
    expect(info.model).toBe("DS1621+");
    expect(loginCount).toBe(2);
  });

  it("throws descriptive error on non-session DSM errors", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.includes("method=login")) return okJson({ success: true, data: { sid: "SID1" } });
      return okJson({ success: false, error: { code: 119, errors: [{ code: 403 }] } });
    });
    const c = new DsmClient({ hostname: "nas01", url: "https://nas01:5001", username: "itsec", password: "p", fetchImpl: fetchMock as unknown as typeof fetch });
    await expect(c.request("SYNO.Core.System", "info", { version: 1 })).rejects.toThrow(/DSM error 119/);
  });

  it("only logs in once when two requests race on a fresh client", async () => {
    let loginCount = 0;
    const fetchMock = vi.fn(async (url: string) => {
      const u = url.toString();
      if (u.includes("method=login")) {
        loginCount++;
        // simulate slow login
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(JSON.stringify({ success: true, data: { sid: "SID1" } }), { status: 200 });
      }
      if (u.includes("method=info")) {
        return new Response(JSON.stringify({ success: true, data: { ok: true } }), { status: 200 });
      }
      return new Response(JSON.stringify({ success: false, error: { code: 103 } }), { status: 200 });
    });
    const c = new DsmClient({ hostname: "nas01", url: "https://nas01:5001", username: "itsec", password: "p", fetchImpl: fetchMock as unknown as typeof fetch });
    await Promise.all([
      c.request("SYNO.Core.System", "info", { version: 1 }),
      c.request("SYNO.Core.System", "info", { version: 1 }),
    ]);
    expect(loginCount).toBe(1);
  });

  it("caches client per hostname via forHost static", async () => {
    const registry = {
      getCredentials: vi.fn(async () => ({ url: "https://nas01:5001", username: "itsec", password: "p" })),
    };
    const c1 = await DsmClient.forHost("nas01", { registry: registry as never });
    const c2 = await DsmClient.forHost("nas01", { registry: registry as never });
    expect(c1).toBe(c2);
    expect(registry.getCredentials).toHaveBeenCalledTimes(1);
  });
});
