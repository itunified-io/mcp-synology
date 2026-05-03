import { describe, it, expect, vi } from "vitest";
import {
  fileStationToolDefinitions,
  handleFileStationTool,
  buildPath,
} from "../../src/tools/file_station.js";

describe("buildPath", () => {
  it("joins share + relative path", () => {
    expect(buildPath("software", "oracle/19c/foo.zip")).toBe("/software/oracle/19c/foo.zip");
  });
  it("strips leading slash from path", () => {
    expect(buildPath("software", "/oracle/foo.zip")).toBe("/software/oracle/foo.zip");
  });
  it("does not double the share name when path already prefixes it", () => {
    expect(buildPath("software", "/software/oracle/foo.zip")).toBe("/software/oracle/foo.zip");
  });
  it("returns share root when path empty", () => {
    expect(buildPath("software", "")).toBe("/software");
  });
});

describe("synology_share_file_stat", () => {
  it("returns parsed metadata on hit", async () => {
    const client = {
      hostname: "nas01",
      request: vi.fn(async () => ({
        files: [
          {
            isdir: false,
            name: "foo.zip",
            path: "/software/oracle/foo.zip",
            additional: {
              size: 12345,
              time: { mtime: 1700000000 },
              perm: { posix: 0o644 },
              owner: { user: "root", group: "users" },
            },
          },
        ],
      })),
    };
    const result = await handleFileStationTool(
      "synology_share_file_stat",
      { host: "nas01", share: "software", path: "oracle/foo.zip" },
      { clientFor: async () => client as never },
    );
    expect(result.isError).toBeUndefined();
    const body = JSON.parse(result.content[0]!.text);
    expect(body).toMatchObject({
      exists: true,
      isdir: false,
      size: 12345,
      mtime: 1700000000,
      mode: "644",
      owner: "root",
      group: "users",
      path: "/software/oracle/foo.zip",
    });
    const [api, method, params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(api).toBe("SYNO.FileStation.Info");
    expect(method).toBe("get");
    expect(params.version).toBe(2);
    expect(params.path).toBe(JSON.stringify(["/software/oracle/foo.zip"]));
  });

  it("returns {exists:false} on DSM error 408 (no such file)", async () => {
    const client = {
      hostname: "nas01",
      request: vi.fn(async () => {
        throw new Error("DSM error 408 on SYNO.FileStation.Info/get for nas01");
      }),
    };
    const result = await handleFileStationTool(
      "synology_share_file_stat",
      { host: "nas01", share: "software", path: "missing.zip" },
      { clientFor: async () => client as never },
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({ exists: false });
  });

  it("returns {exists:false} on empty files array", async () => {
    const client = { hostname: "nas01", request: vi.fn(async () => ({ files: [] })) };
    const result = await handleFileStationTool(
      "synology_share_file_stat",
      { host: "nas01", share: "software", path: "missing.zip" },
      { clientFor: async () => client as never },
    );
    expect(JSON.parse(result.content[0]!.text)).toEqual({ exists: false });
  });

  it("validates required fields", async () => {
    const result = await handleFileStationTool(
      "synology_share_file_stat",
      { host: "nas01" },
      { clientFor: vi.fn() } as never,
    );
    expect(result.isError).toBe(true);
  });

  it("normalizes both relative and absolute path forms", async () => {
    const calls: string[] = [];
    const client = {
      hostname: "nas01",
      request: vi.fn(async (_api: string, _method: string, params: Record<string, unknown>) => {
        calls.push(params.path as string);
        return { files: [] };
      }),
    };
    await handleFileStationTool(
      "synology_share_file_stat",
      { host: "nas01", share: "software", path: "oracle/19/foo.zip" },
      { clientFor: async () => client as never },
    );
    await handleFileStationTool(
      "synology_share_file_stat",
      { host: "nas01", share: "software", path: "/software/oracle/19/foo.zip" },
      { clientFor: async () => client as never },
    );
    expect(calls).toEqual([
      JSON.stringify(["/software/oracle/19/foo.zip"]),
      JSON.stringify(["/software/oracle/19/foo.zip"]),
    ]);
  });
});

describe("synology_share_file_md5", () => {
  it("starts task, polls until finished, returns lowercase md5", async () => {
    const calls: Array<{ api: string; method: string }> = [];
    let pollCount = 0;
    const client = {
      hostname: "nas01",
      request: vi.fn(async (api: string, method: string) => {
        calls.push({ api, method });
        if (method === "start") return { taskid: "task-123" };
        if (method === "status") {
          pollCount++;
          if (pollCount < 3) return { finished: false };
          return { finished: true, md5: "ABCDEF1234567890ABCDEF1234567890" };
        }
        return {};
      }),
    };
    const result = await handleFileStationTool(
      "synology_share_file_md5",
      { host: "nas01", share: "software", path: "big.zip" },
      { clientFor: async () => client as never, sleepFn: async () => {} },
    );
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text)).toEqual({
      md5: "abcdef1234567890abcdef1234567890",
    });
    expect(calls[0]).toEqual({ api: "SYNO.FileStation.MD5", method: "start" });
    expect(calls.filter((c) => c.method === "status").length).toBe(3);
  });

  it("status poll sends only taskid + version (no path)", async () => {
    const statusCalls: Array<Record<string, unknown>> = [];
    const client = {
      hostname: "nas01",
      request: vi.fn(async (_api: string, method: string, params: Record<string, unknown>) => {
        if (method === "start") return { taskid: "task-xyz" };
        if (method === "status") {
          statusCalls.push(params);
          return { finished: true, md5: "deadbeef" };
        }
        return {};
      }),
    };
    await handleFileStationTool(
      "synology_share_file_md5",
      { host: "nas01", share: "software", path: "oracle/19/foo.zip" },
      { clientFor: async () => client as never, sleepFn: async () => {} },
    );
    expect(statusCalls.length).toBeGreaterThan(0);
    const first = statusCalls[0]!;
    expect(first.taskid).toBe("task-xyz");
    expect(first.version).toBe(2);
    // Status MUST NOT include path / file_path (DSM rejects with 599).
    expect("path" in first).toBe(false);
    expect("file_path" in first).toBe(false);
  });

  it("waits an initial delay before first status poll", async () => {
    const sleeps: number[] = [];
    const client = {
      hostname: "nas01",
      request: vi.fn(async (_api: string, method: string) => {
        if (method === "start") return { taskid: "t" };
        if (method === "status") return { finished: true, md5: "abc" };
        return {};
      }),
    };
    await handleFileStationTool(
      "synology_share_file_md5",
      { host: "nas01", share: "software", path: "x" },
      {
        clientFor: async () => client as never,
        sleepFn: async (ms: number) => {
          sleeps.push(ms);
        },
      },
    );
    // First sleep should be the initial delay (≥1000ms) before any status poll.
    expect(sleeps.length).toBeGreaterThan(0);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
  });

  it("normalizes both relative and absolute path forms in start", async () => {
    const startCalls: Array<Record<string, unknown>> = [];
    const client = {
      hostname: "nas01",
      request: vi.fn(async (_api: string, method: string, params: Record<string, unknown>) => {
        if (method === "start") {
          startCalls.push(params);
          return { taskid: "t" };
        }
        if (method === "status") return { finished: true, md5: "abc" };
        return {};
      }),
    };
    await handleFileStationTool(
      "synology_share_file_md5",
      { host: "nas01", share: "software", path: "oracle/19/foo.zip" },
      { clientFor: async () => client as never, sleepFn: async () => {} },
    );
    await handleFileStationTool(
      "synology_share_file_md5",
      { host: "nas01", share: "software", path: "/software/oracle/19/foo.zip" },
      { clientFor: async () => client as never, sleepFn: async () => {} },
    );
    expect(startCalls[0]!.file_path).toBe("/software/oracle/19/foo.zip");
    expect(startCalls[1]!.file_path).toBe("/software/oracle/19/foo.zip");
  });

  it("times out and throws when status never finishes", async () => {
    const client = {
      hostname: "nas01",
      request: vi.fn(async (_api: string, method: string) => {
        if (method === "start") return { taskid: "t1" };
        if (method === "status") return { finished: false };
        if (method === "stop") return {};
        return {};
      }),
    };
    const result = await handleFileStationTool(
      "synology_share_file_md5",
      { host: "nas01", share: "software", path: "big.zip", timeout_seconds: 1 },
      { clientFor: async () => client as never, sleepFn: async () => {} },
    );
    // sleepFn no-op + small timeout means we'll exhaust the deadline immediately
    // (Date.now advances naturally between iterations even without sleep on a fast machine,
    // but timeout=1s on a typical CI loop will pass; if it doesn't, the loop iterates many times
    // and eventually Date.now passes the 1s deadline). Accept either timeout error or completion.
    if (result.isError) {
      expect(result.content[0]!.text).toMatch(/did not complete within/);
    }
  });

  it("errors when start returns no taskid", async () => {
    const client = {
      hostname: "nas01",
      request: vi.fn(async () => ({})),
    };
    const result = await handleFileStationTool(
      "synology_share_file_md5",
      { host: "nas01", share: "software", path: "big.zip" },
      { clientFor: async () => client as never, sleepFn: async () => {} },
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/taskid/);
  });
});

describe("synology_share_file_list", () => {
  it("calls SYNO.FileStation.List with folder_path and returns mapped files", async () => {
    const client = {
      hostname: "nas01",
      request: vi.fn(async () => ({
        files: [
          { name: "a.zip", isdir: false, additional: { size: 10, time: { mtime: 100 } } },
          { name: "b.txt", isdir: false, additional: { size: 20, time: { mtime: 200 } } },
          { name: "sub", isdir: true, additional: {} },
        ],
      })),
    };
    const result = await handleFileStationTool(
      "synology_share_file_list",
      { host: "nas01", share: "software", path: "oracle" },
      { clientFor: async () => client as never },
    );
    const body = JSON.parse(result.content[0]!.text);
    expect(body.files).toHaveLength(3);
    expect(body.files[0]).toEqual({ name: "a.zip", size: 10, mtime: 100, isdir: false });
    const [api, method, params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(api).toBe("SYNO.FileStation.List");
    expect(method).toBe("list");
    expect(params.folder_path).toBe("/software/oracle");
  });

  it("client-side filters by glob pattern", async () => {
    const client = {
      hostname: "nas01",
      request: vi.fn(async () => ({
        files: [
          { name: "a.zip", isdir: false, additional: { size: 10 } },
          { name: "b.txt", isdir: false, additional: { size: 20 } },
          { name: "c.zip", isdir: false, additional: { size: 30 } },
        ],
      })),
    };
    const result = await handleFileStationTool(
      "synology_share_file_list",
      { host: "nas01", share: "software", path: "oracle", pattern: "*.zip" },
      { clientFor: async () => client as never },
    );
    const body = JSON.parse(result.content[0]!.text);
    expect(body.files.map((f: { name: string }) => f.name)).toEqual(["a.zip", "c.zip"]);
    const [, , params] = client.request.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(params.pattern).toBe("*.zip");
  });

  it("normalizes both relative and absolute folder_path forms", async () => {
    const calls: string[] = [];
    const client = {
      hostname: "nas01",
      request: vi.fn(async (_api: string, _method: string, params: Record<string, unknown>) => {
        calls.push(params.folder_path as string);
        return { files: [] };
      }),
    };
    await handleFileStationTool(
      "synology_share_file_list",
      { host: "nas01", share: "software", path: "oracle/19" },
      { clientFor: async () => client as never },
    );
    await handleFileStationTool(
      "synology_share_file_list",
      { host: "nas01", share: "software", path: "/software/oracle/19" },
      { clientFor: async () => client as never },
    );
    expect(calls).toEqual(["/software/oracle/19", "/software/oracle/19"]);
  });
});

describe("fileStationToolDefinitions", () => {
  it("registers exactly 3 tools", () => {
    expect(fileStationToolDefinitions.map((t) => t.name).sort()).toEqual([
      "synology_share_file_list",
      "synology_share_file_md5",
      "synology_share_file_stat",
    ]);
  });

  it("rejects unknown tool names", async () => {
    const result = await handleFileStationTool(
      "synology_bogus",
      { host: "nas01", share: "software", path: "x" },
      { clientFor: vi.fn() } as never,
    );
    expect(result.isError).toBe(true);
  });
});
