# Changelog

All notable changes to this project are documented here. Format: [CalVer](https://calver.org/) — `YYYY.MM.DD.N`.

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
