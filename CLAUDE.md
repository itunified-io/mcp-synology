# mcp-synology — CLAUDE.md

## Project Overview

**mcp-synology** is a slim, read-only MCP server for Synology DSM monitoring.
It exposes 19 tools across 10 domains via the DSM Web API.

**Scope: Read-only monitoring only. No SSH. No write operations. API-only.**
Write operations (share creation, user management, volume changes) belong in the private enterprise repo.

- **Public repo:** [itunified-io/mcp-synology](https://github.com/itunified-io/mcp-synology)
- **npm package:** `@itunified.io/mcp-synology`
- **Versioning:** CalVer — `YYYY.MM.DD.N` (e.g., `v2026.4.23-1`)

## Architecture

```
mcp-synology/
  src/
    index.ts              — Entry point: Vault loader + Server + tool dispatch
    client/
      synology-client.ts  — Axios-based DSM Web API client (SID cookie auth via SYNO.API.Auth)
    config/
      vault-loader.ts     — Vault AppRole secret injection + host discovery
    tools/                — 10 domain tool files (definitions + handlers)
      hosts.ts            — 1 tool: list
      system.ts           — 2 tools: info, update-status
      network.ts          — 2 tools: interfaces, routes
      volumes.ts          — 2 tools: list, status
      shares.ts           — 2 tools: list, permissions-get
      users.ts            — 2 tools: user-list, group-list
      iscsi.ts            — 3 tools: target-list, lun-list, initiator-acl-list
      snapshots.ts        — 1 tool: list
      packages.ts         — 1 tool: list
      diag.ts             — 3 tools: disk-health, smart, log-tail
    utils/
      errors.ts           — DSM error handling + MCP error formatting
      validation.ts       — Zod schema helpers
  tests/                  — Vitest unit tests
  .claude/skills/         — Claude Code skills (synology-*)
  dist/                   — Compiled output (gitignored)
```

## Code Conventions

### TypeScript
- Strict TypeScript (`strict: true` in tsconfig.json)
- ES modules with `.js` extensions on all local imports
- Top-level `await` for Vault loading in `index.ts`

### Tool Naming
All tools follow the pattern `synology_<domain>_<action>`:
- `synology_host_list`, `synology_system_info`, `synology_volume_list`, etc.
- Domain prefixes: `host`, `system`, `network`, `volume`, `share`, `user`, `group`, `iscsi`, `snapshot`, `package`, `diag`

### Zod Validation
- All tool inputs validated with Zod schemas
- Use `z.coerce.number()` for numeric params that may arrive as strings
- Error messages returned as MCP text content, never thrown raw

### Error Handling
- All handler functions return `{ content: [{ type: 'text', text: string }] }`
- DSM API errors formatted via `utils/errors.ts`
- Session expired (error 106) triggers automatic re-login + retry

### Runtime Dependencies (3 only)
- `@modelcontextprotocol/sdk` — MCP server framework
- `axios` — HTTP client for DSM Web API
- `zod` — Input validation

## Configuration

Per-host DSM credentials come from Vault. Only the Vault AppRole connection env vars are required at runtime.

### Vault (required)
| Variable | Description |
|----------|-------------|
| `NAS_VAULT_ADDR` | Vault server address |
| `NAS_VAULT_ROLE_ID` | AppRole role ID |
| `NAS_VAULT_SECRET_ID` | AppRole secret ID |
| `NAS_VAULT_KV_MOUNT` | KV v2 mount path (default: `kv`) |

Vault KV path: `network/hosts/<hostname>/services/dsm-api`
Fields: `url` → DSM base URL, `username` → DSM account, `password` → DSM account password

Host discovery: the loader enumerates `network/hosts/*/services/dsm-api` to build the host inventory exposed by `synology_host_list`. Per-host DSM sessions are cached lazily and re-established on session error 106.

## Security

- **stdio transport only** — no HTTP endpoint, no network exposure
- **SID cookie auth** — DSM session via `SYNO.API.Auth` login; SID held in-memory only, never logged
- **SSL verification** configurable — allow self-signed certs via per-host Vault field
- **No credential logging** — secrets never written to stderr/stdout
- **Read-only** — all tools query DSM APIs only; no write APIs invoked

## Public Repo Documentation Policy (ADR-0004)

This is a **public repository**. All documentation MUST use generic placeholders:
- Hostnames: `your-nas.example.com` (not real hostnames)
- IPs: `192.168.1.100` or `10.0.0.1` (not real IPs)
- Usernames: `admin` or `monitor`
- Passwords: `your-password` or `xxxxxxxx`

Infrastructure-specific details (real IPs, operational runbooks) belong only in the private infrastructure repo.

## Git Workflow

### Branching — NEVER work on main
- `main` = production state, protected
- All changes via feature branches + PR
- Naming: `feature/<issue-nr>-<description>`, `fix/<issue-nr>-<description>`

### Mandatory per change
- GitHub issue (every code change needs one)
- Commit references issue: `feat: add tool (#42)`
- CHANGELOG.md updated before merge
- CalVer tag + GitHub release after merge

### Commit Style
```
feat: add synology_volume_list tool (#5)
fix: handle session expiry (error 106) with auto re-login (#12)
docs: update README tool table (#15)
```

## Skills

Skills live in `.claude/skills/` and follow naming `/synology-<action>`:

| Skill | Command | Description |
|-------|---------|-------------|
| synology-health | `/synology-health` | Traffic-light NAS health dashboard |
| synology-inventory | `/synology-inventory` | Full volume/share/iSCSI/user inventory |
| synology-test | `/synology-test` | Live test suite against configured hosts |

See `.claude/skills/README.md` for full skill reference.

## Development Workflow

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Start server (requires Vault env vars)
export NAS_VAULT_ADDR=https://vault.example.com
export NAS_VAULT_ROLE_ID=<approle-id>
export NAS_VAULT_SECRET_ID=<approle-secret>
node dist/index.js
```

## Testing

- Framework: Vitest
- Unit tests use a mocked SynologyClient (no live DSM required)
- Run: `npm test`
- All tests must pass before any PR merge

## Pre-Publish Security Scan (ADR-0026)

Before `npm publish`, the `prepublishOnly` hook runs `scripts/prepublish-check.js`.
This blocks publish if forbidden files (`.env`, `.pem`, `.key`, credentials) would be included in the tarball.

Use the `/npm-publish` skill for all publishing — never `npm publish` directly.

## CHANGELOG (mandatory)

Every PR merge gets a CHANGELOG entry. Format:
```markdown
## v2026.04.23.1

- New: synology_volume_list tool (#5)
- Fix: handle session expiry gracefully (#12)
```

## Registry Listing (ADR-0018)

This server MUST be listed on:
- [Glama](https://glama.ai) — include security/license/quality badges in README
- [GitHub MCP Servers](https://github.com/modelcontextprotocol/servers)

`server.json` mcpName: `io.github.itunified-io/synology`
