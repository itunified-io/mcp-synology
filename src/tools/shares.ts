import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema, NonEmptyStringSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface SharesContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
}

const HostOnly = z.object({ host: HostnameSchema });
const HostAndName = z.object({ host: HostnameSchema, name: NonEmptyStringSchema });

export const sharesToolDefinitions = [
  {
    name: "synology_share_list",
    description: "List all CIFS/AFP/NFS shared folders with paths, sizes, encryption, quotas.",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
  {
    name: "synology_share_permissions_get",
    description: "Read permissions for a named share (user + group ACLs).",
    inputSchema: {
      type: "object",
      properties: { host: { type: "string" }, name: { type: "string", description: "Share name (e.g. proxmox, software)" } },
      required: ["host", "name"],
      additionalProperties: false,
    } as const,
  },
];

export async function handleSharesTool(
  name: string,
  args: Record<string, unknown>,
  ctx: SharesContext,
): Promise<ToolResult> {
  try {
    if (name === "synology_share_list") {
      const { host } = HostOnly.parse(args);
      const client = await ctx.clientFor(host);
      const data = await client.request("SYNO.Core.Share", "list", {
        version: 1,
        additional: JSON.stringify(["hidden", "encryption", "share_quota", "enable_share_cow", "enable_recycle_bin"]),
      });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    if (name === "synology_share_permissions_get") {
      const { host, name: shareName } = HostAndName.parse(args);
      const client = await ctx.clientFor(host);
      const data = await client.request("SYNO.Core.Share.Permission", "list", { version: 1, name: shareName });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return formatDsmError(err);
  }
}
