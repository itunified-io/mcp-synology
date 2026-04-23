import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface SystemContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
}

const HostInputSchema = z.object({ host: HostnameSchema });

export const systemToolDefinitions = [
  {
    name: "synology_system_info",
    description: "Get Synology NAS system info (model, serial, DSM version, uptime, CPU, temperature). Requires host param.",
    inputSchema: {
      type: "object",
      properties: { host: { type: "string", description: "Hostname (short) of the Synology, e.g. nas01" } },
      required: ["host"],
      additionalProperties: false,
    } as const,
  },
  {
    name: "synology_system_update_status",
    description: "Check if DSM updates are available for this host.",
    inputSchema: {
      type: "object",
      properties: { host: { type: "string" } },
      required: ["host"],
      additionalProperties: false,
    } as const,
  },
];

export async function handleSystemTool(
  name: string,
  args: Record<string, unknown>,
  ctx: SystemContext,
): Promise<ToolResult> {
  try {
    const { host } = HostInputSchema.parse(args);
    const client = await ctx.clientFor(host);
    switch (name) {
      case "synology_system_info": {
        const data = await client.request("SYNO.Core.System", "info", { version: 1 });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      case "synology_system_update_status": {
        const data = await client.request("SYNO.Core.Upgrade.Server", "check", { version: 1 });
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return formatDsmError(err);
  }
}
