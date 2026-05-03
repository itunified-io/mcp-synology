/**
 * Live-verify probe for #12: validates DSM 7.x SYNO.FileStation.Info method=get
 * (Bug 1) and SYNO.FileStation.MD5 start+poll cycle (Bug 2).
 *
 * Usage:
 *   source ~/.secrets/.env && npx tsx scripts/probe-filestation.ts nas01
 */

import https from "node:https";

const HOST = process.argv[2] ?? "nas01";

const VAULT_ADDR = process.env.NAS_VAULT_ADDR ?? "https://nas01:8443";
const ROLE_ID = process.env.NAS_VAULT_ROLE_ID_MCP_SYNOLOGY ?? process.env.NAS_VAULT_ROLE_ID_MCP_SYNOLOGY_ENTERPRISE!;
const SECRET_ID = process.env.NAS_VAULT_SECRET_ID_MCP_SYNOLOGY ?? process.env.NAS_VAULT_SECRET_ID_MCP_SYNOLOGY_ENTERPRISE!;

if (!ROLE_ID || !SECRET_ID) {
  console.error("Set NAS_VAULT_ROLE_ID_MCP_SYNOLOGY + NAS_VAULT_SECRET_ID_MCP_SYNOLOGY (source ~/.secrets/.env)");
  process.exit(1);
}

new https.Agent({ rejectUnauthorized: false }); // ensure import used

async function fetchJson<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  return (await r.json()) as T;
}

async function main() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  const loginResp = await fetchJson<{ auth: { client_token: string } }>(
    `${VAULT_ADDR}/v1/auth/approle/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role_id: ROLE_ID, secret_id: SECRET_ID }),
    },
  );
  const vaultToken = loginResp.auth?.client_token;
  if (!vaultToken) throw new Error("Vault login failed");

  const credsResp = await fetchJson<{
    data?: { data?: { username?: string; password?: string; port?: number; protocol?: string } };
  }>(`${VAULT_ADDR}/v1/kv/data/network/hosts/${HOST}/services/dsm-api`, {
    headers: { "X-Vault-Token": vaultToken },
  });
  const creds = credsResp.data?.data;
  if (!creds?.username || !creds?.password) throw new Error("DSM creds missing");

  const dsmHost = HOST === "nas01" ? "10.10.0.20" : HOST;
  const dsmUrl = `${creds.protocol ?? "https"}://${dsmHost}:${creds.port ?? 5001}`;

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
  if (!loginBody.success || !loginBody.data?.sid) throw new Error(`DSM login failed: ${JSON.stringify(loginBody)}`);
  const sid = loginBody.data.sid;
  console.log(`[probe] DSM login ok`);

  const cookie = `id=${sid}`;
  const TEST_FILE = "/software/oracle/19/opatch/12.2.0.1.47/p6880880_190000_Linux-x86-64.zip";
  const TEST_DIR = "/software/oracle/19/grid_home";

  // 1. Bug 1 verify: SYNO.FileStation.Info method=get vs getinfo
  for (const method of ["getinfo", "get"]) {
    const u = `${dsmUrl}/webapi/entry.cgi?` +
      new URLSearchParams({
        api: "SYNO.FileStation.Info",
        method,
        version: "2",
        path: JSON.stringify([TEST_FILE]),
        additional: JSON.stringify(["size", "time"]),
      }).toString();
    const r = await fetch(u, { headers: { Cookie: cookie } });
    const b = (await r.json()) as { success: boolean; data?: unknown; error?: { code: number } };
    console.log(`[probe] Info.${method} → success=${b.success} code=${b.error?.code ?? "—"}`);
    if (b.success) {
      const f = (b.data as { files?: Array<{ name: string; additional?: { size?: number } }> }).files?.[0];
      console.log(`          name=${f?.name} size=${f?.additional?.size}`);
    }
  }

  // 2. Bug 2 verify: MD5 start + status poll
  const startUrl = `${dsmUrl}/webapi/entry.cgi?` +
    new URLSearchParams({
      api: "SYNO.FileStation.MD5",
      method: "start",
      version: "2",
      file_path: TEST_FILE,
    }).toString();
  const startRes = await fetch(startUrl, { headers: { Cookie: cookie } });
  const startBody = (await startRes.json()) as { success: boolean; data?: { taskid?: string }; error?: { code: number } };
  console.log(`[probe] MD5.start → success=${startBody.success} taskid=${startBody.data?.taskid?.slice(0, 16) ?? "—"}`);
  if (!startBody.success || !startBody.data?.taskid) throw new Error(`MD5 start failed: ${JSON.stringify(startBody)}`);
  const taskid = startBody.data.taskid;

  // First, prove DSM 599 if we poll *immediately* (no delay).
  const immediateStatus = `${dsmUrl}/webapi/entry.cgi?` +
    new URLSearchParams({ api: "SYNO.FileStation.MD5", method: "status", version: "2", taskid }).toString();
  const ir = await fetch(immediateStatus, { headers: { Cookie: cookie } });
  const ib = (await ir.json()) as { success: boolean; error?: { code: number }; data?: { finished?: boolean; md5?: string } };
  console.log(`[probe] MD5.status (immediate) → success=${ib.success} code=${ib.error?.code ?? "—"} finished=${ib.data?.finished}`);

  // Now wait 1.5s and poll.
  await new Promise((r) => setTimeout(r, 1500));
  const deadline = Date.now() + 120_000;
  let finalMd5: string | undefined;
  while (Date.now() < deadline) {
    const sr = await fetch(immediateStatus, { headers: { Cookie: cookie } });
    const sb = (await sr.json()) as { success: boolean; error?: { code: number }; data?: { finished?: boolean; md5?: string } };
    if (!sb.success) {
      console.log(`[probe] MD5.status (after delay) → ERROR code=${sb.error?.code}`);
      break;
    }
    if (sb.data?.finished) {
      finalMd5 = sb.data.md5;
      console.log(`[probe] MD5.status → finished, md5=${finalMd5}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 3. List the grid_home dir
  const listUrl = `${dsmUrl}/webapi/entry.cgi?` +
    new URLSearchParams({
      api: "SYNO.FileStation.List",
      method: "list",
      version: "2",
      folder_path: TEST_DIR,
      additional: JSON.stringify(["size", "time"]),
    }).toString();
  const listRes = await fetch(listUrl, { headers: { Cookie: cookie } });
  const listBody = (await listRes.json()) as { success: boolean; data?: { files?: Array<{ name: string }> }; error?: { code: number } };
  console.log(`[probe] List ${TEST_DIR} → success=${listBody.success} count=${listBody.data?.files?.length ?? 0}`);
  if (listBody.data?.files) {
    for (const f of listBody.data.files.slice(0, 5)) console.log(`          ${f.name}`);
  }

  console.log(`\n[probe] FINAL MD5 for ${TEST_FILE}: ${finalMd5 ?? "(not captured)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
