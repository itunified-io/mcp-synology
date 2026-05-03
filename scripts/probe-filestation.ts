/**
 * Live-verify probe for #12: validates DSM 7.x SYNO.FileStation.Info method=get
 * (Bug 1) and SYNO.FileStation.MD5 start+poll cycle (Bug 2).
 *
 * Usage:
 *   source ~/.secrets/.env && npx tsx scripts/probe-filestation.ts nas01
 */

import https from "node:https";

const HOST = process.argv[2] ?? "nas01";

const VAULT_ADDR = process.env.NAS_VAULT_ADDR ?? "https://vault.int.itunified.io";
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

  // 1. Bug 1 verify: try multiple Info variants — method=get vs getinfo, path JSON-array vs string,
  //    api SYNO.FileStation.Info vs SYNO.FileStation.GetInfo (DSM 6.x legacy).
  const variants: Array<{ tag: string; api: string; method: string; pathParam: string }> = [
    { tag: "Info.get path=JSON-array",       api: "SYNO.FileStation.Info",    method: "get",     pathParam: JSON.stringify([TEST_FILE]) },
    { tag: "Info.get path=string",           api: "SYNO.FileStation.Info",    method: "get",     pathParam: TEST_FILE },
    { tag: "Info.getinfo path=JSON-array",   api: "SYNO.FileStation.Info",    method: "getinfo", pathParam: JSON.stringify([TEST_FILE]) },
    { tag: "Info.getinfo path=string",       api: "SYNO.FileStation.Info",    method: "getinfo", pathParam: TEST_FILE },
    { tag: "GetInfo.getinfo path=JSON-array",api: "SYNO.FileStation.GetInfo", method: "getinfo", pathParam: JSON.stringify([TEST_FILE]) },
  ];
  for (const v of variants) {
    const u = `${dsmUrl}/webapi/entry.cgi?` +
      new URLSearchParams({
        api: v.api,
        method: v.method,
        version: "2",
        path: v.pathParam,
        additional: JSON.stringify(["size", "time", "perm", "owner"]),
      }).toString();
    const r = await fetch(u, { headers: { Cookie: cookie } });
    const b = await r.json() as Record<string, unknown>;
    console.log(`[probe] ${v.tag}\n          ${JSON.stringify(b)}`);
  }

  // 1b. Discover all FileStation APIs
  const apiInfoUrl = `${dsmUrl}/webapi/entry.cgi?` +
    new URLSearchParams({ api: "SYNO.API.Info", method: "query", version: "1", query: "all" }).toString();
  const apiInfoRes = await fetch(apiInfoUrl, { headers: { Cookie: cookie } });
  const apiInfoBody = await apiInfoRes.json() as { data?: Record<string, unknown> };
  const fsApis = Object.keys(apiInfoBody.data ?? {}).filter(k => k.startsWith("SYNO.FileStation"));
  console.log(`[probe] FileStation APIs available:\n          ${fsApis.join("\n          ")}`);

  // 1c. Try the *actual* file-info methods documented in older DSM SDK
  const moreVariants: Array<{ tag: string; api: string; method: string; extra?: Record<string,string> }> = [
    { tag: "FileStation.GetInfo.get path=JSON-array",   api: "SYNO.FileStation.GetInfo",   method: "get",     extra: { path: JSON.stringify([TEST_FILE]) } },
    { tag: "FileStation.GetInfo.getinfo path=JSON",     api: "SYNO.FileStation.GetInfo",   method: "getinfo", extra: { path: JSON.stringify([TEST_FILE]) } },
    { tag: "FileStation.List.getinfo path=JSON-array",  api: "SYNO.FileStation.List",      method: "getinfo", extra: { path: JSON.stringify([TEST_FILE]) } },
    { tag: "FileStation.List.getinfo path=string",      api: "SYNO.FileStation.List",      method: "getinfo", extra: { path: TEST_FILE } },
  ];
  for (const v of moreVariants) {
    const u = `${dsmUrl}/webapi/entry.cgi?` +
      new URLSearchParams({ api: v.api, method: v.method, version: "2", additional: JSON.stringify(["size","time","perm","owner"]), ...v.extra }).toString();
    const r = await fetch(u, { headers: { Cookie: cookie } });
    const b = await r.json();
    console.log(`[probe] ${v.tag}\n          ${JSON.stringify(b).slice(0,500)}`);
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
  console.log(`[probe] MD5.start RAW → ${JSON.stringify(startBody)}`);
  if (!startBody.success || !startBody.data?.taskid) throw new Error(`MD5 start failed: ${JSON.stringify(startBody)}`);
  const taskid = startBody.data.taskid;

  // First, prove DSM 599 if we poll *immediately* (no delay).
  const immediateStatus = `${dsmUrl}/webapi/entry.cgi?` +
    new URLSearchParams({ api: "SYNO.FileStation.MD5", method: "status", version: "2", taskid }).toString();
  const ir = await fetch(immediateStatus, { headers: { Cookie: cookie } });
  const ib = (await ir.json()) as { success: boolean; error?: { code: number }; data?: { finished?: boolean; md5?: string } };
  console.log(`[probe] MD5.status v2 (immediate) RAW → ${JSON.stringify(ib)}`);

  // Try alternative status shapes
  const altStatusVariants: Array<{ tag: string; params: Record<string,string> }> = [
    { tag: "MD5.status v=1 taskid",      params: { api: "SYNO.FileStation.MD5", method: "status", version: "1", taskid } },
    { tag: "MD5.getinfo v=2 taskid",     params: { api: "SYNO.FileStation.MD5", method: "getinfo", version: "2", taskid } },
    { tag: "MD5.status v=2 file_path",   params: { api: "SYNO.FileStation.MD5", method: "status", version: "2", taskid, file_path: TEST_FILE } },
  ];
  for (const v of altStatusVariants) {
    const u = `${dsmUrl}/webapi/entry.cgi?` + new URLSearchParams(v.params).toString();
    const r = await fetch(u, { headers: { Cookie: cookie } });
    const b = await r.json();
    console.log(`[probe] ${v.tag} → ${JSON.stringify(b)}`);
  }

  // 2b. Re-start MD5 and list BackgroundTask to see real task status
  const start2 = await fetch(`${dsmUrl}/webapi/entry.cgi?` + new URLSearchParams({
    api: "SYNO.FileStation.MD5", method: "start", version: "2", file_path: TEST_FILE,
  }).toString(), { headers: { Cookie: cookie } });
  const start2Body = await start2.json() as { data?: { taskid?: string } };
  const tid2 = start2Body.data?.taskid;
  console.log(`[probe] MD5.start #2 → taskid=${tid2}`);

  for (const ms of [500, 2000, 5000, 10000, 20000, 30000]) {
    await new Promise(r => setTimeout(r, ms));
    const sr = await fetch(`${dsmUrl}/webapi/entry.cgi?` + new URLSearchParams({
      api: "SYNO.FileStation.MD5", method: "status", version: "2", taskid: tid2!,
    }).toString(), { headers: { Cookie: cookie } });
    const sb = await sr.json();
    console.log(`[probe] +${ms}ms MD5.status → ${JSON.stringify(sb)}`);
  }

  // 2c. BackgroundTask.list
  const btUrl = `${dsmUrl}/webapi/entry.cgi?` + new URLSearchParams({
    api: "SYNO.FileStation.BackgroundTask", method: "list", version: "3",
  }).toString();
  const btRes = await fetch(btUrl, { headers: { Cookie: cookie } });
  const btBody = await btRes.json();
  console.log(`[probe] BackgroundTask.list → ${JSON.stringify(btBody).slice(0,800)}`);

  // 2d. Stop any in-flight, then a CLEAN single MD5 cycle
  if (tid2) {
    await fetch(`${dsmUrl}/webapi/entry.cgi?` + new URLSearchParams({
      api: "SYNO.FileStation.MD5", method: "stop", version: "2", taskid: tid2,
    }).toString(), { headers: { Cookie: cookie } });
  }
  await new Promise(r => setTimeout(r, 2000));
  console.log(`[probe] === CLEAN cycle — fresh MD5 task ===`);
  const cleanStart = await fetch(`${dsmUrl}/webapi/entry.cgi?` + new URLSearchParams({
    api: "SYNO.FileStation.MD5", method: "start", version: "2", file_path: TEST_FILE,
  }).toString(), { headers: { Cookie: cookie } });
  const cleanBody = await cleanStart.json() as { data?: { taskid?: string } };
  const cleanTid = cleanBody.data?.taskid!;
  console.log(`[probe] clean MD5.start → ${cleanTid}`);
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 1000));
    const sr = await fetch(`${dsmUrl}/webapi/entry.cgi?` + new URLSearchParams({
      api: "SYNO.FileStation.MD5", method: "status", version: "2", taskid: cleanTid,
    }).toString(), { headers: { Cookie: cookie } });
    const sb = await sr.json() as { success: boolean; data?: { finished?: boolean; md5?: string }; error?: { code: number } };
    console.log(`[probe] +${i+1}s clean MD5.status → ${JSON.stringify(sb)}`);
    if (sb.success && sb.data?.finished) break;
  }

  // Now wait 1.5s and poll.
  await new Promise((r) => setTimeout(r, 1500));
  const deadline = Date.now() + 120_000;
  let finalMd5: string | undefined;
  while (Date.now() < deadline) {
    const sr = await fetch(immediateStatus, { headers: { Cookie: cookie } });
    const sb = (await sr.json()) as { success: boolean; error?: { code: number }; data?: { finished?: boolean; md5?: string } };
    console.log(`[probe] MD5.status (poll) RAW → ${JSON.stringify(sb)}`);
    if (!sb.success) break;
    if (sb.data?.finished) {
      finalMd5 = sb.data.md5;
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
