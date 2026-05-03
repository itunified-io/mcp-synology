# Changelog

All notable changes to this project are documented here. Format: [CalVer](https://calver.org/) — `YYYY.MM.DD.N`.

## v2026.5.3-2

### Fixed: File Station path-handling bugs (#12)

Three follow-up fixes to the v2026.5.3-1 File Station tools surfaced by
infrastructure `/lab-preflight` Gap 2 hard-checks against `nas01` (DSM 7.x):

1. **`synology_share_file_stat` used wrong DSM method name.** The tool called
   `SYNO.FileStation.Info/getinfo`, which DSM 7.x rejects with error 103
   ("method does not exist"). DSM 7.x uses `method=get`. Fixed.
2. **`synology_share_file_md5` status poll returned DSM 599 on immediate poll.**
   Added a 1500 ms initial delay between `start` and the first `status` request
   so the MD5 task has time to register. The status request body already only
   sent `taskid + version` (no path) — the fault was timing, not payload shape.
3. **Path normalization is now explicitly tested as the contract.** Both forms
   continue to work via `buildPath`: `oracle/19/foo.zip` (relative to share)
   and `/software/oracle/19/foo.zip` (full DSM path). Added explicit
   round-trip tests for all three tools (`stat`, `md5`, `list`).

Added live-verify probe `scripts/probe-filestation.ts` for operators on the
LAN (the dev Mac cannot reach `nas01:8443` directly through Tailscale).

Tests: 17 → 20 in `file_station.test.ts` (82 total, all green).

## v2026.5.3-1

### Added: File Station read tools (#10) — lab-preflight Gap 2

Three new tools wrapping DSM `SYNO.FileStation.*` for read-only file inspection
under any DSM share:

- `synology_share_file_stat` — stat a file/directory; returns `{exists:false}`
  cleanly on miss (DSM error 408/400/414/417), so callers can branch without try/catch.
- `synology_share_file_md5` — async MD5 computation via `start` + poll `status`
  (default 300s timeout, max 3600s) — handles multi-GB Oracle binaries.
- `synology_share_file_list` — directory listing with optional glob pattern
  (server-side `pattern` param + client-side fallback filter).

Used by the infrastructure repo's `/lab-preflight` skill to hard-verify Oracle
19c binary integrity on `//nas01/software` before Phase D installs (replaces
the previous soft-skip behaviour).

Tool count: 19 → 22.

## v2026.4.28-1

### Fixed: synology_iscsi_initiator_acl_list returned no ACL data on DSM 7.x (#9)

Live test on nas01 (DSM 7.x) confirmed the tool was silently broken: it called
`SYNO.Core.ISCSI.Target.list` with `additional=["allowed_hosts"]`, which is
the DSM 6.x global "host" allowlist model. DSM 7.x removed that — ACLs moved
to a **per-LUN** model. The old call returned the same target list as
`synology_iscsi_target_list` with no ACL fields whatsoever.

Empirical probe (committed in `scripts/probe-acl.ts`) tried multiple
`additional` values across both `Target.list` and `LUN.list`. The winning
combination on DSM 7.x is:

```ts
client.request("SYNO.Core.ISCSI.LUN", "list", {
  additional: JSON.stringify(["acls"]),
})
```

Returns each LUN with a populated `acls: [{iqn, permission}, ...]` array,
including the default open-policy entry plus any per-initiator ACLs bound via
`synology_iscsi_initiator_acl_add` (mcp-synology-enterprise v2026.4.28-3+).

### Changed (response shape)

`synology_iscsi_initiator_acl_list` now returns `{ luns: [...] }` (each LUN
with an `acls` array) instead of `{ targets: [...] }` (which never carried
ACL data anyway). Tool description updated to match.

### Verified live

End-to-end test on nas01 with mcp-synology-enterprise v2026.4.28-3 setting
the ACL → mcp-synology v2026.4.28-1 listing it back → MCP-driven, both sides
working.

### Cross-refs

- itunified-io/mcp-synology-enterprise#2 (write-side per-LUN fix, v2026.4.28-3)
- itunified-io/infrastructure#439 (live verification meta-issue)

## v2026.4.25-1

### Phase 1.1: re-pin DSM API paths for DSM 7.2 (#7)

Live test against DSM 7.2.1-69057 revealed 5 hardcoded API paths inherited from DSM 6.x are gone. Re-pinned via SYNO.API.Info discovery:

- `synology_volume_list`, `synology_volume_status` → use `SYNO.Storage.CGI.Storage/load_info v1` (returns detected_pools instead of separate Volume API)
- `synology_diag_disk_health` → same `load_info` endpoint, returns disks[]
- `synology_diag_smart` → same `load_info`, returns rolled-up per-disk smart_status (full SMART attribute table is not exposed via DSM 7.2 Web API for non-root users; SSH escape hatch in Phase 2 if needed)
- `synology_network_routes` → `SYNO.Core.Network/get v2` (returns gateway + DNS; DSM 7.2 doesn't expose static-route table to non-root API users)

Tool count unchanged (19). All tests pass against the new mocks. Live verified on nas01.

## v2026.04.25.1

### feat(skills): add /synology-test + /synology-health + /synology-inventory skills (#5)

Three operational skills shipped with mcp-synology:
- `/synology-test <host>` — live-test every read-only tool, report to Slack
- `/synology-health [host]` — traffic-light health dashboard
- `/synology-inventory <host>` — full Markdown inventory report

## v2026.04.23.1

### Initial release (#1)

- Scaffold: TypeScript/Node 20 MCP server with stdio transport
- DSM Web API client with lazy per-host cache + session refresh on error 106
- Vault AppRole loader + Vault-driven host discovery
- **19 read-only tools** across 10 DSM subsystems:
  - hosts: `synology_host_list`
  - system: `synology_system_info`, `synology_system_update_status`
  - network: `synology_network_interfaces`, `synology_network_routes`
  - volumes: `synology_volume_list`, `synology_volume_status`
  - shares: `synology_share_list`, `synology_share_permissions_get`
  - users: `synology_user_list`, `synology_group_list`
  - iscsi: `synology_iscsi_target_list`, `synology_iscsi_lun_list`, `synology_iscsi_initiator_acl_list`
  - snapshots: `synology_snapshot_list`
  - packages: `synology_package_list`
  - diag: `synology_diag_disk_health`, `synology_diag_smart`, `synology_diag_log_tail`
- Skills: `/synology-health`, `/synology-inventory`, `/synology-test`
