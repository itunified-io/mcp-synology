import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema, NonEmptyStringSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface SnapshotsContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
}

const Input = z.object({ host: HostnameSchema, share: NonEmptyStringSchema });

export const snapshotsToolDefinitions = [
  {
    name: "synology_snapshot_list",
    description: "List share snapshots for one share.",
    inputSchema: {
      type: "object",
      properties: { host: { type: "string" }, share: { type: "string", description: "Share name" } },
      required: ["host", "share"],
      additionalProperties: false,
    } as const,
  },
];

export async function handleSnapshotsTool(
  name: string,
  args: Record<string, unknown>,
  ctx: SnapshotsContext,
): Promise<ToolResult> {
  try {
    if (name !== "synology_snapshot_list") throw new Error(`Unknown tool: ${name}`);
    const { host, share } = Input.parse(args);
    const client = await ctx.clientFor(host);
    const data = await client.request("SYNO.Core.Share.Snapshot", "list", { version: 1, name: share });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return formatDsmError(err);
  }
}
