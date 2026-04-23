import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface UsersContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
}

const HostOnly = z.object({ host: HostnameSchema });

export const usersToolDefinitions = [
  {
    name: "synology_user_list",
    description: "List all DSM local users (name, uid, gid, description, expired, disabled).",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
  {
    name: "synology_group_list",
    description: "List all DSM local groups (name, gid, description).",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
];

export async function handleUsersTool(
  name: string,
  args: Record<string, unknown>,
  ctx: UsersContext,
): Promise<ToolResult> {
  try {
    const { host } = HostOnly.parse(args);
    const client = await ctx.clientFor(host);
    const apis: Record<string, string> = {
      synology_user_list: "SYNO.Core.User",
      synology_group_list: "SYNO.Core.Group",
    };
    const api = apis[name];
    if (!api) throw new Error(`Unknown tool: ${name}`);
    const data = await client.request(api, "list", { version: 1, offset: 0, limit: -1 });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return formatDsmError(err);
  }
}
