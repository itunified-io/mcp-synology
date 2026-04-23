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
    description: "List IPv4/IPv6 routing table entries on this Synology host.",
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
    const apiByName: Record<string, { api: string; method: string }> = {
      synology_network_interfaces: { api: "SYNO.Core.Network.Interface", method: "list" },
      synology_network_routes: { api: "SYNO.Core.Network.Route", method: "list" },
    };
    const spec = apiByName[name];
    if (!spec) throw new Error(`Unknown tool: ${name}`);
    const data = await client.request(spec.api, spec.method, { version: 1 });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return formatDsmError(err);
  }
}
