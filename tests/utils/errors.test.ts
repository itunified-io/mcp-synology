import { describe, it, expect } from "vitest";
import { formatDsmError, dsmErrorMessage } from "../../src/utils/errors.js";

describe("dsmErrorMessage", () => {
  it("maps known DSM error codes to human messages", () => {
    expect(dsmErrorMessage(101)).toBe("No parameter of API, method or version.");
    expect(dsmErrorMessage(400)).toBe("No such account or incorrect password.");
    expect(dsmErrorMessage(403)).toBe("One-time password not specified.");
    expect(dsmErrorMessage(106)).toBe("Session timeout.");
    expect(dsmErrorMessage(107)).toBe("Session interrupted by duplicated login.");
  });

  it("falls back to a generic message for unknown codes", () => {
    expect(dsmErrorMessage(99999)).toBe("Unknown DSM error (code 99999).");
  });
});

describe("formatDsmError", () => {
  it("formats an Error with host + operation context", () => {
    const err = new Error("DSM error 400 on SYNO.API.Auth/login for nas01");
    const result = formatDsmError(err);
    expect(result.content[0]?.text).toContain("nas01");
    expect(result.content[0]?.text).toContain("No such account");
    expect(result.isError).toBe(true);
  });
});
