---
name: synology-inventory
description: Full inventory of a Synology host — shares, volumes, iSCSI targets/LUNs, users, groups, packages. Markdown tables.
disable-model-invocation: true
---

# /synology-inventory

Full-picture inventory of one Synology host. Useful for audits, drift detection, capacity planning.

## Usage

```
/synology-inventory <host>
```

## Steps

1. Header — `synology_system_info` output (model, DSM version, serial, uptime)
2. **Volumes** table — from `synology_volume_list`: ID, type, total, used, %, status
3. **Shares** table — from `synology_share_list`: name, path, size used, encryption, quota
4. **iSCSI** section:
   - Targets table from `synology_iscsi_target_list`: IQN, enabled, mapped LUN count
   - LUNs table from `synology_iscsi_lun_list`: name, size, location, mapped-to
   - Initiator ACLs from `synology_iscsi_initiator_acl_list`
5. **Users** table — from `synology_user_list`: name, uid, gid, description, disabled
6. **Groups** table — from `synology_group_list`: name, gid, description
7. **Packages** table — from `synology_package_list`: id, version, status
8. **Network** — from `synology_network_interfaces`: interface, IP, MAC, MTU, link

## Output

Markdown, one section per area. Copy-pasteable into issues/docs.

## Cleanup

Read-only skill.
