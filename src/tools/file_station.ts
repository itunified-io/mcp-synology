import { z } from "zod";
import type { DsmClient } from "../client/dsm-client.js";
import { HostnameSchema, NonEmptyStringSchema } from "../utils/validation.js";
import { formatDsmError } from "../utils/errors.js";
import type { ToolResult } from "./types.js";

export interface FileStationContext {
  clientFor: (hostname: string) => Promise<DsmClient>;
  /** Optional override for sleep between MD5 polls — primarily for tests. */
  sleepFn?: (ms: number) => Promise<void>;
}

const StatInput = z.object({
  host: HostnameSchema,
  share: NonEmptyStringSchema,
  path: NonEmptyStringSchema,
});

const Md5Input = z.object({
  host: HostnameSchema,
  share: NonEmptyStringSchema,
  path: NonEmptyStringSchema,
  timeout_seconds: z.number().int().positive().max(3600).optional(),
});

const ListInput = z.object({
  host: HostnameSchema,
  share: NonEmptyStringSchema,
  path: NonEmptyStringSchema,
  pattern: z.string().min(1).optional(),
});

/**
 * Build the absolute DSM path from share + relative path.
 * Examples:
 *   buildPath("software", "oracle/19c/foo.zip") -> "/software/oracle/19c/foo.zip"
 *   buildPath("software", "/oracle/19c/foo.zip") -> "/software/oracle/19c/foo.zip"
 *   buildPath("software", "/software/oracle/foo.zip") -> "/software/oracle/foo.zip"
 *   buildPath("software", "") -> "/software"
 */
export function buildPath(share: string, path: string): string {
  const cleanShare = share.replace(/^\/+|\/+$/g, "");
  const cleanPath = path.replace(/^\/+/, "");
  // If user already prefixed with the share name, don't double it.
  if (cleanPath === cleanShare || cleanPath.startsWith(`${cleanShare}/`)) {
    return `/${cleanPath}`;
  }
  if (cleanPath === "") return `/${cleanShare}`;
  return `/${cleanShare}/${cleanPath}`;
}

interface FileStationStat {
  isdir?: boolean;
  name?: string;
  path?: string;
  additional?: {
    size?: number;
    time?: { mtime?: number };
    perm?: { posix?: number };
    owner?: { user?: string; group?: string };
  };
}

interface FileStationListEntry {
  name: string;
  path?: string;
  isdir: boolean;
  additional?: {
    size?: number;
    time?: { mtime?: number };
  };
}

interface FileStationGetInfoResp {
  files?: FileStationStat[];
}

interface FileStationListResp {
  files?: FileStationListEntry[];
  total?: number;
}

interface FileStationMd5StartResp {
  taskid: string;
}

interface FileStationMd5StatusResp {
  finished: boolean;
  md5?: string;
}

export const fileStationToolDefinitions = [
  {
    name: "synology_share_file_stat",
    description:
      "Stat a file or directory under a Synology share via SYNO.FileStation.Info. Returns {exists, size, mtime, mode, owner, isdir}. Returns {exists:false} cleanly when the path is missing — does not error.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string", description: "Synology hostname (resolves via Vault registry)" },
        share: { type: "string", description: "Share name (e.g. software, proxmox)" },
        path: { type: "string", description: "Path under the share (e.g. oracle/19c/foo.zip) or full DSM path (/software/oracle/19c/foo.zip)" },
      },
      required: ["host", "share", "path"],
      additionalProperties: false,
    } as const,
  },
  {
    name: "synology_share_file_md5",
    description:
      "Compute MD5 of a file under a Synology share via SYNO.FileStation.MD5 (async start + poll). Default timeout 300s. Returns {md5: lowercase-hex}. Errors if file missing or timeout exceeded.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        share: { type: "string" },
        path: { type: "string" },
        timeout_seconds: {
          type: "number",
          description: "Max seconds to poll for completion (default 300, max 3600)",
        },
      },
      required: ["host", "share", "path"],
      additionalProperties: false,
    } as const,
  },
  {
    name: "synology_share_file_list",
    description:
      "List directory contents under a Synology share via SYNO.FileStation.List. Optional `pattern` glob filter (server-side via DSM `pattern` param, falls back to client-side). Returns {files:[{name,size,mtime,isdir}]}.",
    inputSchema: {
      type: "object",
      properties: {
        host: { type: "string" },
        share: { type: "string" },
        path: { type: "string", description: "Directory path under share (use empty string for share root)" },
        pattern: { type: "string", description: "Optional glob pattern filter (e.g. *.zip)" },
      },
      required: ["host", "share", "path"],
      additionalProperties: false,
    } as const,
  },
];

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function isMissingFileError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // FileStation error code 408 = "No such file or directory" on DSM 7.x.
  // Code 400 sometimes returned as well.
  return /DSM error (408|400|414|417)/.test(msg);
}

function octalMode(perm: number | undefined): string {
  if (perm === undefined) return "";
  // DSM 7.x returns posix perm as the literal decimal of the octal digits — i.e. 0o755 is sent as
  // the integer 755 (NOT 0o755 = 493). Verified live against DSM 7.2 on 2026-05-03 (#12 v2 probe):
  // a 0o777 file came back as `posix: 777`.
  // We render the value as-is, zero-padded to 3 digits.
  return String(perm).padStart(3, "0");
}

function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`);
}

export async function handleFileStationTool(
  name: string,
  args: Record<string, unknown>,
  ctx: FileStationContext,
): Promise<ToolResult> {
  try {
    if (name === "synology_share_file_stat") {
      const { host, share, path } = StatInput.parse(args);
      const fullPath = buildPath(share, path);
      const client = await ctx.clientFor(host);
      try {
        // DSM 7.x: file stat is SYNO.FileStation.List method=getinfo.
        // SYNO.FileStation.Info.get returns FileStation user-session info, NOT file info.
        // Verified live against DSM 7.2 / nas01 on 2026-05-03 (#12 v2 probe).
        const data = await client.request<FileStationGetInfoResp>("SYNO.FileStation.List", "getinfo", {
          version: 2,
          path: JSON.stringify([fullPath]),
          additional: JSON.stringify(["size", "time", "perm", "owner"]),
        });
        const entry = data.files?.[0];
        // DSM 7.x `SYNO.FileStation.List.getinfo` does NOT raise an error for missing paths;
        // it returns a placeholder entry with empty `name` and no `additional`. Treat that as
        // not-found. Verified live against DSM 7.2 on 2026-05-03 (#12 v2 probe).
        if (!entry || (!entry.name && !entry.additional)) {
          return { content: [{ type: "text", text: JSON.stringify({ exists: false }) }] };
        }
        const result = {
          exists: true,
          isdir: entry.isdir === true,
          size: entry.additional?.size ?? null,
          mtime: entry.additional?.time?.mtime ?? null,
          mode: octalMode(entry.additional?.perm?.posix),
          owner: entry.additional?.owner?.user ?? "",
          group: entry.additional?.owner?.group ?? "",
          path: entry.path ?? fullPath,
          name: entry.name ?? "",
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (err) {
        if (isMissingFileError(err)) {
          return { content: [{ type: "text", text: JSON.stringify({ exists: false }) }] };
        }
        throw err;
      }
    }

    if (name === "synology_share_file_md5") {
      const { host, share, path, timeout_seconds } = Md5Input.parse(args);
      const fullPath = buildPath(share, path);
      const client = await ctx.clientFor(host);
      const timeoutMs = (timeout_seconds ?? 300) * 1000;
      const sleep = ctx.sleepFn ?? defaultSleep;

      const started = await client.request<FileStationMd5StartResp>("SYNO.FileStation.MD5", "start", {
        version: 2,
        file_path: fullPath,
      });
      const taskid = started.taskid;
      if (!taskid) {
        throw new Error(`MD5 task did not return a taskid for ${fullPath}`);
      }

      const pollIntervalMs = 1000;
      const deadline = Date.now() + timeoutMs;
      // DSM allows only ONE concurrent MD5 task per session. If a stale task is in flight,
      // status polls return error 599 ("Unknown DSM error"). Treat 599 as transient: keep
      // polling until either a real finished result or the timeout.
      // Verified live against DSM 7.2 on 2026-05-03 (#12 v2 probe) — clean cycles complete
      // in ~1s for a 72MB file.
      let consecutive599 = 0;
      const max599 = Math.max(10, Math.ceil(timeoutMs / pollIntervalMs));
      while (Date.now() < deadline) {
        try {
          const status = await client.request<FileStationMd5StatusResp>("SYNO.FileStation.MD5", "status", {
            version: 2,
            taskid,
          });
          consecutive599 = 0;
          if (status.finished) {
            if (!status.md5) {
              throw new Error(`MD5 task ${taskid} reported finished but no md5 returned for ${fullPath}`);
            }
            return { content: [{ type: "text", text: JSON.stringify({ md5: status.md5.toLowerCase() }) }] };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/DSM error 599/.test(msg)) {
            consecutive599 += 1;
            if (consecutive599 > max599) {
              throw new Error(`MD5 task ${taskid} returned DSM error 599 repeatedly — another MD5 task may be in flight on this session`);
            }
          } else {
            throw err;
          }
        }
        await sleep(pollIntervalMs);
      }
      // Best-effort: stop the runaway task. DSM cleans up on its own eventually.
      try {
        await client.request("SYNO.FileStation.MD5", "stop", { version: 2, taskid });
      } catch {
        // ignore
      }
      throw new Error(`MD5 task for ${fullPath} did not complete within ${timeout_seconds ?? 300}s`);
    }

    if (name === "synology_share_file_list") {
      const { host, share, path, pattern } = ListInput.parse(args);
      const fullPath = buildPath(share, path);
      const client = await ctx.clientFor(host);
      const params: Record<string, string | number | boolean> = {
        version: 2,
        folder_path: fullPath,
        additional: JSON.stringify(["size", "time"]),
      };
      if (pattern !== undefined) params["pattern"] = pattern;
      const data = await client.request<FileStationListResp>("SYNO.FileStation.List", "list", params);
      const all = data.files ?? [];
      // Client-side pattern fallback in case DSM ignored the pattern param.
      const filtered = pattern && pattern !== "*"
        ? all.filter((f) => globToRegex(pattern).test(f.name))
        : all;
      const files = filtered.map((f) => ({
        name: f.name,
        size: f.additional?.size ?? null,
        mtime: f.additional?.time?.mtime ?? null,
        isdir: f.isdir === true,
      }));
      return { content: [{ type: "text", text: JSON.stringify({ files }, null, 2) }] };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err) {
    return formatDsmError(err);
  }
}
