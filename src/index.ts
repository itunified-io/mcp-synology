#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { loadFromVault } from "./config/vault-loader.js";
import { HostRegistry } from "./config/host-registry.js";
import { DsmClient } from "./client/dsm-client.js";
import { hostsToolDefinitions, handleHostsTool } from "./tools/hosts.js";
import { systemToolDefinitions, handleSystemTool } from "./tools/system.js";
import { networkToolDefinitions, handleNetworkTool } from "./tools/network.js";
import { volumesToolDefinitions, handleVolumesTool } from "./tools/volumes.js";
import { sharesToolDefinitions, handleSharesTool } from "./tools/shares.js";
import { usersToolDefinitions, handleUsersTool } from "./tools/users.js";
import { iscsiToolDefinitions, handleIscsiTool } from "./tools/iscsi.js";
import { snapshotsToolDefinitions, handleSnapshotsTool } from "./tools/snapshots.js";
import { packagesToolDefinitions, handlePackagesTool } from "./tools/packages.js";
import { diagToolDefinitions, handleDiagTool } from "./tools/diag.js";
import { fileStationToolDefinitions, handleFileStationTool } from "./tools/file_station.js";

export const ALL_TOOL_DEFINITIONS = [
  ...hostsToolDefinitions,
  ...systemToolDefinitions,
  ...networkToolDefinitions,
  ...volumesToolDefinitions,
  ...sharesToolDefinitions,
  ...usersToolDefinitions,
  ...iscsiToolDefinitions,
  ...snapshotsToolDefinitions,
  ...packagesToolDefinitions,
  ...diagToolDefinitions,
  ...fileStationToolDefinitions,
];

// Only run server when invoked as main, not when imported by tests.
const isMain = import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  await loadFromVault({
    kvPath: "mcp-synology/config",
    mapping: {},
  });

  const registry = new HostRegistry({
    vaultAddr: process.env["NAS_VAULT_ADDR"] ?? "",
    roleId: process.env["NAS_VAULT_ROLE_ID"] ?? "",
    secretId: process.env["NAS_VAULT_SECRET_ID"] ?? "",
    mount: process.env["NAS_VAULT_KV_MOUNT"] ?? "kv",
  });

  const clientFor = async (hostname: string): Promise<DsmClient> =>
    DsmClient.forHost(hostname, { registry });

  const server = new Server(
    { name: "mcp-synology", version: "2026.5.3-1" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: ALL_TOOL_DEFINITIONS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const run = async () => {
      if (hostsToolDefinitions.some((t) => t.name === name)) return handleHostsTool(name, args, { registry });
      if (systemToolDefinitions.some((t) => t.name === name)) return handleSystemTool(name, args, { clientFor });
      if (networkToolDefinitions.some((t) => t.name === name)) return handleNetworkTool(name, args, { clientFor });
      if (volumesToolDefinitions.some((t) => t.name === name)) return handleVolumesTool(name, args, { clientFor });
      if (sharesToolDefinitions.some((t) => t.name === name)) return handleSharesTool(name, args, { clientFor });
      if (usersToolDefinitions.some((t) => t.name === name)) return handleUsersTool(name, args, { clientFor });
      if (iscsiToolDefinitions.some((t) => t.name === name)) return handleIscsiTool(name, args, { clientFor });
      if (snapshotsToolDefinitions.some((t) => t.name === name)) return handleSnapshotsTool(name, args, { clientFor });
      if (packagesToolDefinitions.some((t) => t.name === name)) return handlePackagesTool(name, args, { clientFor });
      if (diagToolDefinitions.some((t) => t.name === name)) return handleDiagTool(name, args, { clientFor });
      if (fileStationToolDefinitions.some((t) => t.name === name)) return handleFileStationTool(name, args, { clientFor });
      return { content: [{ type: "text", text: `Unknown tool: ${name}` }], isError: true };
    };
    const result = await run();
    return result as unknown as { content: Array<{ type: "text"; text: string }>; isError?: boolean; [k: string]: unknown };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[mcp-synology] ready\n");
}
