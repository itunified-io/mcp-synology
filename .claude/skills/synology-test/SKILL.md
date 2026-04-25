---
name: synology-test
description: Live-test mcp-synology against a real Synology host. Exercises every read-only tool, reports pass/fail summary to Slack (C0ALHK18VC5).
disable-model-invocation: true
---

# /synology-test

Live-test every mcp-synology tool against the configured target Synology host.

## Usage

```
/synology-test <host>
```

- `<host>` is the short hostname recognized by the HostRegistry (e.g. `nas01`). Defaults to the first host returned by `synology_host_list` if omitted.

## Steps

1. **Precheck** — call `synology_host_list` → expect the target host in the list.
2. **System** — `synology_system_info` + `synology_system_update_status` → record DSM version, uptime, model.
3. **Network** — `synology_network_interfaces` + `synology_network_routes` → expect at least one up interface, at least one default route.
4. **Storage** — `synology_volume_list` → expect at least one volume in `normal` state. For each volume, `synology_volume_status`.
5. **Shares** — `synology_share_list` → expect `proxmox` share present. `synology_share_permissions_get name=proxmox`.
6. **Users/Groups** — `synology_user_list` + `synology_group_list` → expect `itsec` user present.
7. **iSCSI** — `synology_iscsi_target_list` + `synology_iscsi_lun_list` + `synology_iscsi_initiator_acl_list` → record counts (may be zero; that's fine).
8. **Snapshots** — `synology_snapshot_list share=proxmox` → record count.
9. **Packages** — `synology_package_list` → expect `ScsiTarget` package present (since iSCSI tools need it).
10. **Diag** — `synology_diag_disk_health` + `synology_diag_smart` + `synology_diag_log_tail lines=50`.

## Output

- Human table on stdout: one row per tool, ✅ / ⚠️ / ❌ + latency
- Slack message to channel `C0ALHK18VC5` with summary (pass/fail counts, host name, DSM version)
- Exit 0 if all ✅, 1 if any ❌

## Bug reporting

If any tool returns `isError: true` or an unexpected shape, file a GH issue in itunified-io/mcp-synology with label `bug` and the raw error text.

## Cleanup

This is a read-only skill. No state change on the NAS.
