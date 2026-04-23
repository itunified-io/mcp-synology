/**
 * Standard tool result shape returned by every handler in src/tools/*.ts.
 *
 * Convention for Phase 1 tool files:
 *   - Each tool module defines its own `XxxContext` interface holding only
 *     the dependencies it needs (e.g. `{registry}` for hosts.ts,
 *     `{clientFor}` for all others). The dispatcher in src/index.ts
 *     passes a superset.
 *   - Handlers return Promise<ToolResult>.
 *   - Any tool with non-empty inputSchema MUST validate args via Zod before
 *     use (`const {host} = HostInputSchema.parse(args)`) — never pass raw
 *     Record<string, unknown> values to downstream clients.
 *   - Errors are wrapped via `formatDsmError` from ../utils/errors.js.
 */
export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: true;
}
