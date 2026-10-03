import { beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "../env";
import { setTestEnv } from "../modules/test-utils";
import { deriveKey } from "./keys";

beforeEach(setTestEnv);

describe("deriveKey (HKDF)", () => {
  it("determinista, 32 bytes, distinta por proposito y distinta del secreto crudo", () => {
    const purposes = ["session", "access", "device-confirm", "google-state", "google-tx"] as const;
    const keys = purposes.map((p) => Buffer.from(deriveKey(p)).toString("hex"));
    expect(new Set(keys).size).toBe(purposes.length);
    for (const k of keys) expect(k).toHaveLength(64);
    expect(Buffer.from(deriveKey("access")).toString("hex")).toBe(keys[1]);
    expect(Buffer.from(deriveKey("access")).toString()).not.toBe(process.env.JWT_SECRET);
  });

  it("cambia si cambia JWT_SECRET (la cache no sirve claves viejas)", () => {
    const before = Buffer.from(deriveKey("session")).toString("hex");
    process.env.JWT_SECRET = "k".repeat(40);
    resetEnvCache();
    expect(Buffer.from(deriveKey("session")).toString("hex")).not.toBe(before);
  });
});
