# Changelog

All notable changes to this project are documented here. Format: [CalVer](https://calver.org/) — `YYYY.MM.DD.N`.

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
