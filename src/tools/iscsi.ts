import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface IscsiContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
}

const HostOnly = z.object({ host: HostnameSchema });

export const iscsiToolDefinitions = [
  {
    name: "synology_iscsi_target_list",
    description: "List all iSCSI targets (IQN, enabled, mapped LUNs).",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
  {
    name: "synology_iscsi_lun_list",
    description: "List all iSCSI LUNs (name, uuid, size, location, mapped-to).",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
  {
    name: "synology_iscsi_initiator_acl_list",
    description:
      "List each iSCSI LUN with its bound initiator ACL entries (DSM 7.x per-LUN model). Returns LUNs with an 'acls' array of {iqn, permission} entries.",
    inputSchema: { type: "object", properties: { host: { type: "string" } }, required: ["host"], additionalProperties: false } as const,
  },
];

export async function handleIscsiTool(
  name: string,
  args: Record<string, unknown>,
  ctx: IscsiContext,
): Promise<ToolResult> {
  try {
    const { host } = HostOnly.parse(args);
    const client = await ctx.clientFor(host);
    let data: unknown;
    switch (name) {
      case "synology_iscsi_target_list":
        data = await client.request("SYNO.Core.ISCSI.Target", "list", { version: 1 });
        break;
      case "synology_iscsi_lun_list":
        data = await client.request("SYNO.Core.ISCSI.LUN", "list", { version: 1 });
        break;
      case "synology_iscsi_initiator_acl_list":
        // DSM 7.x: ACLs are per-LUN, not per-target. The DSM 6.x global "host"
        // model (and the corresponding `allowed_hosts` additional flag on
        // SYNO.Core.ISCSI.Target.list) was removed — Target.list with that flag
        // silently returns no ACL data on DSM 7.x. The working surface is
        // SYNO.Core.ISCSI.LUN.list with `additional=["acls"]`, which returns
        // each LUN with a populated `acls: [{iqn, permission}, ...]` array.
        // See itunified-io/mcp-synology#9 and the per-LUN write-side fix in
        // itunified-io/mcp-synology-enterprise#2 (v2026.4.28-3).
        data = await client.request("SYNO.Core.ISCSI.LUN", "list", {
          version: 1,
          additional: JSON.stringify(["acls"]),
        });
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  } catch (err) {
    return formatDsmError(err);
  }
}
