import { describe, expect, it } from "vitest";
import { loadKriSeedRows, KRI_MONTHS } from "../server/kris";

describe("KRI register", () => {
  it("loads every KRI sheet row with monthly result and remarks columns", () => {
    const rows = loadKriSeedRows();
    expect(rows).toHaveLength(5);
    expect(rows.map((row) => `${row.riskCode}:${row.kriNumber}`)).toEqual([
      "CS-5-1:KRI 1",
      "CS-2-1:KRI 1",
      "CS-2-1:KRI 2",
      "CS-6-1:KRI 1",
      "CS-6-1:KRI 2",
    ]);
    const first = rows[0];
    expect(first.riskName).toContain("Cyberattacks");
    expect(first.janResult).toBe("Good");
    expect(String(first.janRemarks).length).toBeGreaterThan(20);
    expect(first.julResult).toBe("Good");
    const patching = rows.find(
      (row) => row.riskCode === "CS-2-1" && row.kriNumber === "KRI 1",
    );
    expect(patching?.aprResult).toBe("Breached");
    expect(new Set(rows.map((row) => row.riskCode))).toEqual(
      new Set(["CS-5-1", "CS-2-1", "CS-6-1"]),
    );
    for (const [key] of KRI_MONTHS) {
      expect(first).toHaveProperty(`${key}Result`);
      expect(first).toHaveProperty(`${key}Remarks`);
    }
  });
});
