# mcp-synology

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![npm](https://img.shields.io/npm/v/@itunified.io/mcp-synology.svg)](https://www.npmjs.com/package/@itunified.io/mcp-synology)

Read-only MCP server for **Synology DSM** with 19 tools across iSCSI, shares, volumes, snapshots, users, system health. Multi-host. DSM Web API.

## Install

```bash
npm install -g @itunified.io/mcp-synology
```

## Configure

Two paths — Vault (recommended) or env vars.

**Vault (multi-host):**
Store DSM credentials in Vault at `kv/network/hosts/<hostname>/services/dsm-api` with fields `url`, `username`, `password`. Then set:

```bash
export NAS_VAULT_ADDR=https://vault.example.com
export NAS_VAULT_ROLE_ID=<approle-id>
export NAS_VAULT_SECRET_ID=<approle-secret>
```

**Env vars (single host):**
Not supported in Phase 1 — use Vault. Future release will add env fallback.

## Tools

| Tool | Description |
|------|-------------|
| `synology_host_list` | List all Synology hosts discoverable via Vault |
| `synology_system_info` | Model, DSM version, uptime, CPU, memory, temperature |
| `synology_system_update_status` | Available DSM updates |
| `synology_network_interfaces` | Interface list (name, IP, MAC, link) |
| `synology_network_routes` | Routing table |
| `synology_volume_list` | All volumes with capacity + status |
| `synology_volume_status` | Detailed status for one volume path |
| `synology_share_list` | All shared folders (CIFS/AFP/NFS) |
| `synology_share_permissions_get` | User + group ACLs for a share |
| `synology_user_list` | All DSM local users |
| `synology_group_list` | All DSM local groups |
| `synology_iscsi_target_list` | All iSCSI targets |
| `synology_iscsi_lun_list` | All iSCSI LUNs |
| `synology_iscsi_initiator_acl_list` | Target → allowed-initiator ACL map |
| `synology_snapshot_list` | Share snapshots |
| `synology_package_list` | Installed DSM packages |
| `synology_diag_disk_health` | Per-disk health via HddMan |
| `synology_diag_smart` | SMART attributes per disk |
| `synology_diag_log_tail` | Tail N lines from DSM system log |

## MCP client config (Claude Desktop)

```json
{
  "mcpServers": {
    "synology": {
      "command": "mcp-synology"
    }
  }
}
```

## License

AGPL-3.0-or-later
