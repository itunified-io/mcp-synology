export interface HostCredentials {
  url: string;
  username: string;
  password: string;
  verify_ssl?: boolean;
  api_version?: string;
}

export interface HostRegistryOptions {
  vaultAddr: string;
  roleId: string;
  secretId: string;
  mount?: string;
  fetchImpl?: typeof fetch;
}

export class HostRegistry {
  private readonly vaultAddr: string;
  private readonly roleId: string;
  private readonly secretId: string;
  private readonly mount: string;
  private readonly fetchFn: typeof fetch;
  private cachedToken?: string;

  constructor(opts: HostRegistryOptions) {
    this.vaultAddr = opts.vaultAddr.replace(/\/+$/, "");
    this.roleId = opts.roleId;
    this.secretId = opts.secretId;
    this.mount = opts.mount ?? "kv";
    this.fetchFn = opts.fetchImpl ?? fetch;
  }

  private async token(): Promise<string> {
    if (this.cachedToken) return this.cachedToken;
    const res = await this.fetchFn(`${this.vaultAddr}/v1/auth/approle/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: this.roleId, secret_id: this.secretId }),
    });
    if (!res.ok) throw new Error(`Vault AppRole login failed: HTTP ${res.status}`);
    const body = (await res.json()) as { auth?: { client_token?: string } };
    const tok = body.auth?.client_token;
    if (!tok) throw new Error("Vault login response missing client_token");
    this.cachedToken = tok;
    return tok;
  }

  async listHosts(): Promise<string[]> {
    const token = await this.token();
    const listRes = await this.fetchFn(`${this.vaultAddr}/v1/${this.mount}/metadata/network/hosts?list=true`, {
      headers: { "X-Vault-Token": token },
    });
    if (!listRes.ok) return [];
    const body = (await listRes.json()) as { data?: { keys?: string[] } };
    const keys = body.data?.keys ?? [];
    const hostnames = keys.map((k) => k.replace(/\/$/, ""));
    const result: string[] = [];
    for (const host of hostnames) {
      const probe = await this.fetchFn(
        `${this.vaultAddr}/v1/${this.mount}/data/network/hosts/${host}/services/dsm-api`,
        { headers: { "X-Vault-Token": token } },
      );
      if (probe.ok) result.push(host);
    }
    return result;
  }

  async getCredentials(hostname: string): Promise<HostCredentials> {
    const token = await this.token();
    const res = await this.fetchFn(
      `${this.vaultAddr}/v1/${this.mount}/data/network/hosts/${hostname}/services/dsm-api`,
      { headers: { "X-Vault-Token": token } },
    );
    if (!res.ok) throw new Error(`Host '${hostname}' has no dsm-api entry in Vault (HTTP ${res.status})`);
    const body = (await res.json()) as { data?: { data?: HostCredentials } };
    const data = body.data?.data;
    if (!data || !data.url || !data.username || !data.password) {
      throw new Error(`Vault entry for '${hostname}' missing required fields (url/username/password)`);
    }
    return data;
  }
}
