import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface NetworkContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
}

const HostInputSchema = z.object({ host: HostnameSchema });

export const networkToolDefinitions = [
  {
    name: "synology_network_interfaces",
    description: "List network interfaces on this Synology host (name, MAC, IPs, link state).",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
  {
    name: "synology_network_routes",
    description: "Default gateway, IPv6 gateway, DNS servers, and global network config. Source: SYNO.Core.Network/get v2. (Static route table not exposed to non-root API users in DSM 7.2.)",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
];

export async function handleNetworkTool(
  name: string,
  args: Record<string, unknown>,
  ctx: NetworkContext,
): Promise<ToolResult> {
  try {
    const { host } = HostInputSchema.parse(args);
    const client = await ctx.clientFor(host);
    if (name === "synology_network_interfaces") {
      const data = await client.request("SYNO.Core.Network.Interface", "list", { version: 1 });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    if (name === "synology_network_routes") {
      const data = await client.request("SYNO.Core.Network", "get", { version: 2 });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return formatDsmError(err);
  }
}
