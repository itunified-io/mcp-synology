import type { DsmApiResponse, DsmLoginData } from "./types.js";
import type { HostCredentials, HostRegistry } from "../config/host-registry.js";

export interface DsmClientOptions {
  hostname: string;
  url: string;
  username: string;
  password: string;
  fetchImpl?: typeof fetch;
  apiVersion?: number;
}

// NOTE: Self-signed certificate support (verify_ssl=false on HostCredentials) is a
// Phase 2 concern. Wiring it requires a custom undici Agent / Dispatcher with
// rejectUnauthorized=false passed into fetch, which is outside this phase's scope.
// The field remains on HostCredentials in src/config/host-registry.ts so Vault data
// is preserved for future use; we simply don't consume it here yet.

interface DsmClientForHostOpts {
  registry: Pick<HostRegistry, "getCredentials">;
  fetchImpl?: typeof fetch;
}

export class DsmClient {
  private static cache = new Map<string, DsmClient>();

  readonly hostname: string;
  private readonly url: string;
  private readonly username: string;
  private readonly password: string;
  private readonly fetchFn: typeof fetch;
  private readonly apiVersion: number;
  private sid?: string;
  private loginPromise?: Promise<void>;

  constructor(opts: DsmClientOptions) {
    this.hostname = opts.hostname;
    this.url = opts.url.replace(/\/+$/, "");
    this.username = opts.username;
    this.password = opts.password;
    this.fetchFn = opts.fetchImpl ?? fetch;
    this.apiVersion = opts.apiVersion ?? 6;
  }

  static async forHost(hostname: string, opts: DsmClientForHostOpts): Promise<DsmClient> {
    const existing = DsmClient.cache.get(hostname);
    if (existing) return existing;
    const creds: HostCredentials = await opts.registry.getCredentials(hostname);
    const client = new DsmClient({
      hostname,
      url: creds.url,
      username: creds.username,
      password: creds.password,
      fetchImpl: opts.fetchImpl,
      apiVersion: creds.api_version ? Number(creds.api_version) : undefined,
    });
    DsmClient.cache.set(hostname, client);
    return client;
  }

  static resetCache(): void {
    DsmClient.cache.clear();
  }

  private async login(): Promise<void> {
    const params = new URLSearchParams({
      api: "SYNO.API.Auth",
      version: String(this.apiVersion),
      method: "login",
      account: this.username,
      passwd: this.password,
      session: "MCP",
      format: "sid",
    });
    const res = await this.fetchFn(`${this.url}/webapi/auth.cgi?${params}`, { method: "GET" });
    const json = (await res.json()) as DsmApiResponse<DsmLoginData>;
    if (!json.success || !json.data?.sid) {
      throw new Error(`DSM login failed for ${this.hostname}: ${JSON.stringify(json.error ?? "no SID")}`);
    }
    this.sid = json.data.sid;
  }

  private async ensureLogin(): Promise<void> {
    if (this.sid) return;
    if (!this.loginPromise) {
      this.loginPromise = this.login().finally(() => { this.loginPromise = undefined; });
    }
    return this.loginPromise;
  }

  async request<T = unknown>(api: string, method: string, params: Record<string, string | number | boolean>): Promise<T> {
    await this.ensureLogin();
    const body = await this.callOnce<T>(api, method, params);
    if (!body.success && body.error?.code === 106) {
      this.sid = undefined;
      await this.ensureLogin();
      const body2 = await this.callOnce<T>(api, method, params);
      if (!body2.success) {
        throw new Error(`DSM error ${body2.error?.code} on ${api}/${method} for ${this.hostname}`);
      }
      return body2.data as T;
    }
    if (!body.success) {
      throw new Error(`DSM error ${body.error?.code} on ${api}/${method} for ${this.hostname}`);
    }
    return body.data as T;
  }

  private async callOnce<T>(api: string, method: string, params: Record<string, string | number | boolean>): Promise<DsmApiResponse<T>> {
    const query = new URLSearchParams({ api, method, version: "1", ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
    const res = await this.fetchFn(`${this.url}/webapi/entry.cgi?${query}`, {
      method: "GET",
      headers: this.sid ? { Cookie: `id=${this.sid}` } : undefined,
    });
    return (await res.json()) as DsmApiResponse<T>;
  }
}
