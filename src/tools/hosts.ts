import type { HostRegistry } from "../config/host-registry.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface HostsContext {
  registry: Pick<HostRegistry, "listHosts">;
}

export const hostsToolDefinitions = [
  {
    name: "synology_host_list",
    description: "List all Synology hosts discoverable via Vault (kv/network/hosts/*/services/dsm-api). No input.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } as const,
  },
];

export async function handleHostsTool(
  name: string,
  _args: Record<string, unknown>,
  ctx: HostsContext,
): Promise<ToolResult> {
  try {
    if (name === "synology_host_list") {
      const hosts = await ctx.registry.listHosts();
      return { content: [{ type: "text", text: JSON.stringify(hosts, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return formatDsmError(err);
  }
}
