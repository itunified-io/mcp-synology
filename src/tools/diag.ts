import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface DiagContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
}

const HostOnly = z.object({ host: HostnameSchema });
const LogInput = z.object({ host: HostnameSchema, lines: z.number().int().min(1).max(10000).default(100) });

export const diagToolDefinitions = [
  {
    name: "synology_diag_disk_health",
    description: "Per-disk status (temperature, vendor, serial, health) via HddMan.",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
  {
    name: "synology_diag_smart",
    description: "SMART attributes per physical disk.",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
  {
    name: "synology_diag_log_tail",
    description: "Tail lines from DSM system log (default 100).",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        lines: { type: "integer", minimum: 1, maximum: 10000, default: 100, description: "How many recent log lines to return" },
      },
      required: ["host"],
      additionalProperties: false,
    } as const,
  },
];

export async function handleDiagTool(
  name: string,
  args: Record<string, unknown>,
  ctx: DiagContext,
): Promise<ToolResult> {
  try {
    if (name === "synology_diag_disk_health") {
      const { host } = HostOnly.parse(args);
      const client = await ctx.clientFor(host);
      const data = await client.request("SYNO.Storage.CGI.HddMan", "load_all_disk_list", { version: 1 });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    if (name === "synology_diag_smart") {
      const { host } = HostOnly.parse(args);
      const client = await ctx.clientFor(host);
      const data = await client.request("SYNO.Storage.CGI.Smart", "list", { version: 2 });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    if (name === "synology_diag_log_tail") {
      const { host, lines } = LogInput.parse(args);
      const client = await ctx.clientFor(host);
      const data = await client.request("SYNO.Core.SyslogClient.Log", "list", { version: 1, lines, filename: "synolog/system.log" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return formatDsmError(err);
  }
}
