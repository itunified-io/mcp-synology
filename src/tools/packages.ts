import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface PackagesContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
}

const HostOnly = z.object({ host: HostnameSchema });

export const packagesToolDefinitions = [
  {
    name: "synology_package_list",
    description: "List installed DSM packages with status + version.",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
];

export async function handlePackagesTool(
  name: string,
  args: Record<string, unknown>,
  ctx: PackagesContext,
): Promise<ToolResult> {
  try {
    if (name !== "synology_package_list") throw new Error(`Unknown tool: ${name}`);
    const { host } = HostOnly.parse(args);
    const client = await ctx.clientFor(host);
    const data = await client.request("SYNO.Core.Package", "list", {
      version: 2,
      additional: JSON.stringify(["status", "description"]),
    });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return formatDsmError(err);
  }
}
