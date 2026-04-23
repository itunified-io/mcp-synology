import { z } from "zod";

/** Linux-style hostname — letters, digits, dashes, periods; no spaces or slashes. */
export const HostnameSchema = z.string().min(1).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, {
  message: "Invalid hostname format",
});

export const NonEmptyStringSchema = z.string().min(1);
