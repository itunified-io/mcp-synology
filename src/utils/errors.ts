const KNOWN_CODES: Record<number, string> = {
  100: "Unknown error.",
  101: "No parameter of API, method or version.",
  102: "The requested API does not exist.",
  103: "The requested method does not exist.",
  104: "The requested version does not support the functionality.",
  105: "The logged in session does not have permission.",
  106: "Session timeout.",
  107: "Session interrupted by duplicated login.",
  119: "SID not found.",
  400: "No such account or incorrect password.",
  401: "Account disabled.",
  402: "Permission denied.",
  403: "One-time password not specified.",
  404: "One-time password authenticate failed.",
  405: "App portal incorrect.",
  406: "OTP code enforced.",
};

export function dsmErrorMessage(code: number): string {
  return KNOWN_CODES[code] ?? `Unknown DSM error (code ${code}).`;
}

export interface ToolErrorResult {
  content: Array<{ type: "text"; text: string }>;
  isError: true;
}

/** Convert a thrown Error (typically from DsmClient) into an MCP tool result. */
export function formatDsmError(err: unknown): ToolErrorResult {
  const raw = err instanceof Error ? err.message : String(err);
  // Try to extract "DSM error <code>" and expand with human message
  const match = raw.match(/DSM error (\d+)/);
  const expanded = match ? `${raw} — ${dsmErrorMessage(Number(match[1]))}` : raw;
  return {
    content: [{ type: "text", text: expanded }],
    isError: true,
  };
}
