/**
 * Empirical probe to discover which `additional` keys surface ACL data
 * on DSM 7.x via SYNO.Core.ISCSI.LUN.list and SYNO.Core.ISCSI.Target.list.
 *
 * Pre-req: a target+LUN exists on nas01 with at least one initiator ACL bound
 * (set up via `synology_iscsi_initiator_acl_add` from mcp-synology-enterprise).
 *
 * Usage:
 *   NAS_VAULT_ROLE_ID=... NAS_VAULT_SECRET_ID=... npx tsx scripts/probe-acl.ts nas01
 *
 * For this probe we read DSM creds directly from Vault (same path the MCP
 * server uses) — no need to wire up the full vault-loader.
 */

import https from "node:https";

const HOST = process.argv[2] ?? "nas01";

// We bypass the full Vault loader for a one-shot probe: read role/secret
// from env, fetch a Vault token, read DSM creds, then probe DSM.
const VAULT_ADDR = process.env.NAS_VAULT_ADDR ?? "https://nas01:8443";
const ROLE_ID = process.env.NAS_VAULT_ROLE_ID_MCP_SYNOLOGY!;
const SECRET_ID = process.env.NAS_VAULT_SECRET_ID_MCP_SYNOLOGY!;

if (!ROLE_ID || !SECRET_ID) {
  console.error("Set NAS_VAULT_ROLE_ID_MCP_SYNOLOGY and NAS_VAULT_SECRET_ID_MCP_SYNOLOGY in env (source ~/.secrets/.env)");
  process.exit(1);
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

async function fetchJson<T = unknown>(url: string, init?: RequestInit & { agent?: unknown }): Promise<T> {
  const opts: RequestInit & { dispatcher?: unknown } = {
    ...init,
    // @ts-expect-error custom dispatcher hack — Node global fetch ignores https.Agent,
    // but for self-signed DSM we set NODE_TLS_REJECT_UNAUTHORIZED=0 below.
  };
  const r = await fetch(url, opts);
  return (await r.json()) as T;
}

async function main() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  // 1. AppRole login → token
  const loginResp = await fetchJson<{ auth: { client_token: string } }>(
    `${VAULT_ADDR}/v1/auth/approle/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: ROLE_ID, secret_id: SECRET_ID }),
    },
  );
  const vaultToken = loginResp.auth?.client_token;
  if (!vaultToken) throw new Error(`Vault login failed: ${JSON.stringify(loginResp).slice(0, 200)}`);

  // 2. Read DSM creds from kv/data/network/hosts/<host>/services/dsm-api
  const credsResp = await fetchJson<{
    data?: { data?: { username?: string; password?: string; port?: number; protocol?: string } };
  }>(`${VAULT_ADDR}/v1/kv/data/network/hosts/${HOST}/services/dsm-api`, {
    headers: { "X-Vault-Token": vaultToken },
  });
  const creds = credsResp.data?.data;
  if (!creds?.username || !creds?.password) throw new Error("DSM creds not in Vault path");

  // hostname `nas01` doesn't resolve via DNS in this lab; use direct IP for DSM probe.
  const dsmHost = HOST === "nas01" ? "10.10.0.20" : HOST;
  const dsmUrl = `${creds.protocol ?? "https"}://${dsmHost}:${creds.port ?? 5001}`;

  // 3. DSM login
  const loginUrl = `${dsmUrl}/webapi/entry.cgi?` +
    new URLSearchParams({
      api: "SYNO.API.Auth",
      method: "login",
      version: "6",
      account: creds.username,
      passwd: creds.password,
      session: "FileStation",
      format: "cookie",
    }).toString();
  const loginRes = await fetch(loginUrl);
  const loginBody = (await loginRes.json()) as { success: boolean; data?: { sid?: string } };
  if (!loginBody.success || !loginBody.data?.sid) {
    throw new Error(`DSM login failed: ${JSON.stringify(loginBody)}`);
  }
  const sid = loginBody.data.sid;
  console.log(`[probe] DSM login ok, sid=${sid.slice(0, 8)}…`);

  // 4. Probe variations
  type Probe = { api: string; method: string; additional?: string };
  const probes: Probe[] = [
    { api: "SYNO.Core.ISCSI.LUN", method: "list" }, // baseline
    { api: "SYNO.Core.ISCSI.LUN", method: "list", additional: '["acl_masks"]' },
    { api: "SYNO.Core.ISCSI.LUN", method: "list", additional: '["whitelist"]' },
    { api: "SYNO.Core.ISCSI.LUN", method: "list", additional: '["mask"]' },
    { api: "SYNO.Core.ISCSI.LUN", method: "list", additional: '["acls"]' },
    { api: "SYNO.Core.ISCSI.LUN", method: "list", additional: '["allow_list"]' },
    { api: "SYNO.Core.ISCSI.LUN", method: "list", additional: '["allowed_initiators"]' },
    { api: "SYNO.Core.ISCSI.Target", method: "list" }, // baseline
    { api: "SYNO.Core.ISCSI.Target", method: "list", additional: '["acl_masks"]' },
    { api: "SYNO.Core.ISCSI.Target", method: "list", additional: '["acls"]' },
    { api: "SYNO.Core.ISCSI.Target", method: "list", additional: '["allowed_hosts"]' }, // current Phase-1
  ];

  for (const p of probes) {
    const params: Record<string, string> = { api: p.api, method: p.method, version: "1" };
    if (p.additional) params.additional = p.additional;
    const u = `${dsmUrl}/webapi/entry.cgi?${new URLSearchParams(params).toString()}`;
    const res = await fetch(u, { headers: { Cookie: `id=${sid}` } });
    const body = (await res.json()) as { success: boolean; data?: unknown; error?: { code: number } };
    const tag = `${p.api}.${p.method}${p.additional ? ` additional=${p.additional}` : ""}`;
    if (!body.success) {
      console.log(`[probe] ${tag} → ERROR ${body.error?.code}`);
      continue;
    }
    const data = body.data as { luns?: unknown[]; targets?: unknown[] };
    const items = data.luns ?? data.targets ?? [];
    const first = items[0];
    if (!first) {
      console.log(`[probe] ${tag} → success, but empty list`);
      continue;
    }
    const keys = Object.keys(first as Record<string, unknown>);
    const aclLike = keys.filter((k) =>
      /acl|whitelist|allow|mask|initiator/i.test(k),
    );
    console.log(`[probe] ${tag} → success`);
    console.log(`         keys=${keys.join(",")}`);
    if (aclLike.length > 0) {
      console.log(`         ACL-LIKE FIELDS FOUND: ${aclLike.join(",")}`);
      for (const k of aclLike) {
        console.log(`           ${k} = ${JSON.stringify((first as Record<string, unknown>)[k])}`);
      }
    } else {
      console.log(`         (no ACL-like fields)`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
