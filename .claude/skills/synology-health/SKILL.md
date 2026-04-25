---
name: synology-health
description: Traffic-light health dashboard for one or more Synology hosts. CPU, memory, disk status, update availability, SMART warnings.
disable-model-invocation: true
---

# /synology-health

Quick health snapshot for every registered Synology host.

## Usage

```
/synology-health [<host>]
```

- With `<host>`: check just that host.
- Without: call `synology_host_list` and iterate every host.

## Steps (per host)

1. `synology_system_info` — record model, DSM version, uptime, CPU %, memory used %, temperature
2. `synology_system_update_status` — updates available? If yes → ⚠️
3. `synology_volume_list` — any volume with status != `normal`? → ⚠️ or ❌ depending on severity (degraded = ⚠️, crashed = ❌)
4. `synology_diag_disk_health` — any disk with non-normal status? → ❌
5. `synology_diag_smart` — any attribute with threshold violation? → ⚠️

## Output

Per host, one line with emoji (✅/⚠️/❌) + key metrics.
Aggregate table across all hosts.
If any ❌ → exit 1.

## Example output

```
🟢 nas01 (DS1621+, DSM 7.2.1-69057, uptime 21d, CPU 4%, RAM 43%, temp 39°C)
  ✅ update-status: up to date
  ✅ volumes: 1 normal
  ✅ disks: 4/4 healthy
  ✅ smart: no warnings
```

## Cleanup

Read-only skill — no mutations.
