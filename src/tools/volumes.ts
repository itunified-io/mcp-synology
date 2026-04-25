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
    description: "List all Synology storage pools / volumes (capacity, usage, RAID type, status). Maps to detected_pools from SYNO.Storage.CGI.Storage/load_info.",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
  {
    name: "synology_volume_status",
    description: "Get detailed status of one volume by path (e.g. /volume1). Filters detected_pools.",
    inputSchema: {
      type: "object",
      properties: { host: { type: "string" }, volume_path: { type: "string", description: "Volume path, e.g. /volume1" } },
      required: ["host", "volume_path"],
      additionalProperties: false,
    } as const,
  },
];

interface StorageInfo {
  detected_pools?: Array<{ pool_path?: string; volume_path?: string; [k: string]: unknown }>;
  missing_pools?: unknown[];
  overview_data?: unknown;
}

export async function handleVolumesTool(
  name: string,
  args: Record<string, unknown>,
  ctx: VolumesContext,
): Promise<ToolResult> {
  try {
    if (name === "synology_volume_list") {
      const { host } = HostOnly.parse(args);
      const client = await ctx.clientFor(host);
      const data = await client.request<StorageInfo>("SYNO.Storage.CGI.Storage", "load_info", { version: 1 });
      const out = {
        pools: data.detected_pools ?? [],
        missing: data.missing_pools ?? [],
        overview: data.overview_data ?? null,
      };
      return { content: [{ type: "text", text: JSON.stringify(out, null, 2) }] };
    }
    if (name === "synology_volume_status") {
      const { host, volume_path } = HostAndPath.parse(args);
      const client = await ctx.clientFor(host);
      const data = await client.request<StorageInfo>("SYNO.Storage.CGI.Storage", "load_info", { version: 1 });
      const pools = data.detected_pools ?? [];
      const match = pools.find((p) => p.pool_path === volume_path || p.volume_path === volume_path);
      if (!match) {
        return {
          content: [{ type: "text", text: `Volume ${volume_path} not found. Known: ${pools.map((p) => p.pool_path ?? p.volume_path).filter(Boolean).join(", ") || "(none)"}` }],
          isError: true,
        };
      }
      return { content: [{ type: "text", text: JSON.stringify(match, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return formatDsmError(err);
  }
}
