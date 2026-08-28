import { describe, expect, it } from "vitest";
import {
  isWatchableType,
  watchKey,
  WATCHABLE_TYPES,
} from "../../client/src/notifications";

describe("notification helpers", () => {
  it("accepts only known watchable registers", () => {
    expect(WATCHABLE_TYPES).toContain("orca");
    expect(isWatchableType("orca")).toBe(true);
    expect(isWatchableType("users")).toBe(false);
  });

  it("builds a stable watch key for an entity", () => {
    expect(watchKey("documents", 12)).toBe("documents:12");
    expect(watchKey("kri-records", "KRI-1")).toBe("kri-records:KRI-1");
  });
});
