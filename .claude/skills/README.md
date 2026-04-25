# mcp-synology Skills

Live, operational skills shipped with the public mcp-synology MCP server.

| Skill | Command | Description |
|-------|---------|-------------|
| synology-health | `/synology-health` | Traffic-light per-host dashboard (CPU, memory, disk, update availability) |
| synology-inventory | `/synology-inventory` | Full per-host inventory (shares + volumes + iSCSI + users) |
| synology-test | `/synology-test <host>` | Live-test every OSS tool, report to Slack |

All skills require a working mcp-synology MCP server wired into the Claude Code session with the host's Vault credentials reachable.
