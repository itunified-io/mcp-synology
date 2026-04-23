import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema, NonEmptyStringSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface VolumesContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
}

const HostOnly = z.object({ host: HostnameSchema });
const HostAndPath = z.object({ host: HostnameSchema, volume_path: NonEmptyStringSchema });

export const volumesToolDefinitions = [
  {
    name: "synology_volume_list",
    description: "List all Synology volumes with capacity, usage, RAID type, and status.",
    inputSchema: {
      type: "object",
      properties: { host: { type: "string", description: "Hostname (short) of the Synology, e.g. nas01" } },
      required: ["host"],
      additionalProperties: false,
    } as const,
  },
  {
    name: "synology_volume_status",
    description: "Get detailed status of one volume by path (e.g. /volume1).",
    inputSchema: {
      type: "object",
      properties: { host: { type: "string" }, volume_path: { type: "string", description: "Volume path, e.g. /volume1" } },
      required: ["host", "volume_path"],
      additionalProperties: false,
    } as const,
  },
];

export async function handleVolumesTool(
  name: string,
  args: Record<string, unknown>,
  ctx: VolumesContext,
): Promise<ToolResult> {
  try {
    if (name === "synology_volume_list") {
      const { host } = HostOnly.parse(args);
      const client = await ctx.clientFor(host);
      const data = await client.request("SYNO.Storage.CGI.Volume", "list", { version: 1 });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    if (name === "synology_volume_status") {
      const { host, volume_path } = HostAndPath.parse(args);
      const client = await ctx.clientFor(host);
      const data = await client.request("SYNO.Storage.CGI.Volume", "get", { version: 1, volume_path });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return formatDsmError(err);
  }
}
