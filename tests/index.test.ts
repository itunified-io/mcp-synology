import { describe, it, expect } from "vitest";
import { ALL_TOOL_DEFINITIONS } from "../src/index.js";

describe("mcp-synology tool registration", () => {
  it("registers exactly 22 tools", () => {
    expect(ALL_TOOL_DEFINITIONS).toHaveLength(22);
  });
  it("each tool name starts with synology_", () => {
    for (const t of ALL_TOOL_DEFINITIONS) expect(t.name).toMatch(/^synology_/);
  });
  it("no duplicate tool names", () => {
    const names = ALL_TOOL_DEFINITIONS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
