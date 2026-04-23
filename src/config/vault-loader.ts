/**
 * Opportunistic HashiCorp Vault AppRole secret loader.
 *
 * Reads Proxmox API credentials from a Vault KV v2 path using AppRole auth.
 * Only runs if NAS_VAULT_ADDR, NAS_VAULT_ROLE_ID, and NAS_VAULT_SECRET_ID
 * are all set in the environment.
 *
 * If Vault is unreachable or credentials are wrong, the loader fails silently
 * (logs a warning to stderr) and falls back to whatever environment variables
 * are already set. This is intentional — the MCP server should still start
 * even without Vault connectivity.
 *
 * Usage in index.ts:
 *   await loadFromVault({
 *     kvPath: "mcp-proxmox/config",
 *     mapping: {
 *       url: "PROXMOX_API_URL",
 *       token_id: "PROXMOX_TOKEN_ID",
 *       token_secret: "PROXMOX_TOKEN_SECRET",
 *     },
 *   });
 */

export interface VaultLoaderOptions {
  kvPath: string;
  mapping: Record<string, string>;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}

interface AppRoleLoginResponse {
  auth?: { client_token?: string };
}

interface KvV2ReadResponse {
  data?: { data?: Record<string, unknown> };
}

export async function loadFromVault(options: VaultLoaderOptions): Promise<void> {
  const env = options.env ?? process.env;
  const fetchFn = options.fetchImpl ?? fetch;

  const addr = env["NAS_VAULT_ADDR"];
  const roleId = env["NAS_VAULT_ROLE_ID"];
  const secretId = env["NAS_VAULT_SECRET_ID"];

  if (!addr || !roleId || !secretId) return;

  const mount = env["NAS_VAULT_KV_MOUNT"] || "kv";
  const base = addr.replace(/\/+$/, "");

  try {
    const loginRes = await fetchFn(`${base}/v1/auth/approle/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
    });
    if (!loginRes.ok) {
      warn(`vault AppRole login failed: HTTP ${loginRes.status}`);
      return;
    }
    const loginJson = (await loginRes.json()) as AppRoleLoginResponse;
    const token = loginJson.auth?.client_token;
    if (!token) {
      warn("vault AppRole login response missing client_token");
      return;
    }

    const kvUrl = `${base}/v1/${mount}/data/${options.kvPath}`;
    const kvRes = await fetchFn(kvUrl, {
      method: "GET",
      headers: { "X-Vault-Token": token },
    });
    if (!kvRes.ok) {
      warn(`vault KV read failed for ${options.kvPath}: HTTP ${kvRes.status}`);
      return;
    }
    const kvJson = (await kvRes.json()) as KvV2ReadResponse;
    const data = kvJson.data?.data;
    if (!data || typeof data !== "object") {
      warn(`vault KV response for ${options.kvPath} missing data.data`);
      return;
    }

    let populated = 0;
    for (const [kvKey, envVar] of Object.entries(options.mapping)) {
      const value = data[kvKey];
      if (typeof value !== "string" || value.length === 0) continue;
      if (env[envVar] !== undefined && env[envVar] !== "") continue;
      env[envVar] = value;
      populated += 1;
    }
    warn(`vault loaded ${populated} value(s) from ${options.kvPath}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warn(`vault load error for ${options.kvPath}: ${msg}`);
  }
}

function warn(msg: string): void {
  process.stderr.write(`[mcp vault-loader] ${msg}\n`);
}
