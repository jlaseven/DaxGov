import { describe, expect, it } from "vitest";
import { departmentKey, israRating, normalizeDepartmentName } from "../../server/isra";
import { tpsaProgress } from "../../server/tpsa";

describe("ISRA and TPSA helpers", () => {
  it("normalizes department names for matching", () => {
    expect(normalizeDepartmentName("  Cyber   Security ")).toBe("Cyber Security");
    expect(departmentKey("Cyber Security")).toBe("cyber security");
    expect(departmentKey("CYBER   SECURITY")).toBe("cyber security");
  });

  it("maps residual scores onto ISRA ratings", () => {
    expect(israRating(null)).toBe("Unrated");
    expect(israRating(1)).toBe("Low");
    expect(israRating(6)).toBe("Moderate");
    expect(israRating(12)).toBe("High");
    expect(israRating(20)).toBe("Critical");
  });

  it("summarizes TPSA assessment progress", () => {
    const progress = tpsaProgress([
      { status: "Ready to Send", sentDate: null, verdict: null },
      { status: "Sent", sentDate: "2026-01-01", verdict: null },
      { status: "Completed", sentDate: "2026-01-02", verdict: "Passed" },
    ] as any);
    expect(progress.sent).toBe(2);
    expect(progress.completionRate).toBe(50);
  });
});
