import { describe, it, expect } from "vitest";
import { HostnameSchema } from "../../src/utils/validation.js";

describe("HostnameSchema", () => {
  it("accepts valid short hostnames", () => {
    expect(HostnameSchema.parse("nas01")).toBe("nas01");
    expect(HostnameSchema.parse("nas-main")).toBe("nas-main");
  });
  it("rejects empty strings", () => {
    expect(() => HostnameSchema.parse("")).toThrow();
  });
  it("rejects hostnames with slashes or spaces", () => {
    expect(() => HostnameSchema.parse("nas 01")).toThrow();
    expect(() => HostnameSchema.parse("nas/01")).toThrow();
  });
});
