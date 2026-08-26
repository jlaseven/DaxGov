import { describe, expect, it } from "vitest";
import { computeOrcaScores, loadOrcaSeedRows, ratingDigit } from "../server/orca";

describe("ORCA assessment", () => {
  it("reads the first digit from ORCA likelihood and impact ratings", () => {
    expect(ratingDigit("5 - Frequent")).toBe(5);
    expect(ratingDigit("1 - Incidental")).toBe(1);
    expect(ratingDigit("")).toBeNull();
    expect(ratingDigit(null)).toBeNull();
  });

  it("computes inherent and residual scores the same way as the spreadsheet", () => {
    expect(
      computeOrcaScores({
        inherentLikelihood: "5 - Frequent",
        inherentImpactRating: "3 - Moderate",
        residualLikelihoodRating: "3 - Possible",
        residualImpactRating: "3 - Moderate",
      }),
    ).toEqual({
      inherentRiskScore: 15,
      residualRiskScore: 9,
      residualLikelihood: 3,
      residualImpact: 3,
    });
  });

  it("loads every Assessment 2026 risk with all register columns", () => {
    const rows = loadOrcaSeedRows();
    expect(rows).toHaveLength(30);
    expect(rows.map((row) => row.riskNo)).toContain("CYB-1-1");
    expect(rows.map((row) => row.riskNo)).toContain("CYB-6-1");
    expect(new Set(rows.map((row) => row.riskNo)).size).toBe(30);
    const first = rows[0];
    expect(first).toMatchObject({
      processNo: "CYB-1",
      process: "Vulnerability Assessment and Penetration Testing",
      riskNo: "CYB-1-1",
      inherentLikelihood: "5 - Frequent",
      inherentImpactRating: "3 - Moderate",
      inherentRiskScore: 15,
      residualRiskScore: 9,
    });
    expect(first.riskThreat.length).toBeGreaterThan(20);
    const asset = rows.find((row) => row.riskNo === "CYB-5-1");
    expect(asset?.actionItems).toMatch(/Physical Asset Security Policy/);
    expect(asset?.status).toBe("Open");
  });
});
