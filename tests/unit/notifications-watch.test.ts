import { describe, expect, it } from "vitest";
import {
  isWatchableType,
  pageForWatchType,
} from "../../server/notifications";
import { rateLimitControls } from "../../server/rateLimits";

describe("watchlist and rate-limit controls", () => {
  it("accepts known watchable entity types", () => {
    expect(isWatchableType("documents")).toBe(true);
    expect(isWatchableType("orca")).toBe(true);
    expect(isWatchableType("users")).toBe(false);
    expect(pageForWatchType("tpsa-records")).toBe("tpsa-monitoring");
    expect(pageForWatchType("kri-records")).toBe("kris");
  });

  it("exposes default rate-limit windows", () => {
    const controls = rateLimitControls();
    expect(controls.login.limit).toBe(5);
    expect(controls.api.limit).toBe(300);
    expect(controls.accountLock.failures).toBe(8);
    expect(controls.accountLock.lockMs).toBe(15 * 60 * 1000);
  });
});
