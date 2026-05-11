import { describe, expect, it, beforeEach } from "vitest";
import bcrypt from "bcryptjs";

describe("bcrypt round-trip (auth foundation)", () => {
  it("hashSync then compare returns true on match", async () => {
    const hash = bcrypt.hashSync("hunter2", 10);
    expect(await bcrypt.compare("hunter2", hash)).toBe(true);
  });

  it("compare returns false on mismatch", async () => {
    const hash = bcrypt.hashSync("hunter2", 10);
    expect(await bcrypt.compare("hunter3", hash)).toBe(false);
  });

  it("produces a different hash each time (salted)", () => {
    const a = bcrypt.hashSync("same", 10);
    const b = bcrypt.hashSync("same", 10);
    expect(a).not.toBe(b);
  });
});
