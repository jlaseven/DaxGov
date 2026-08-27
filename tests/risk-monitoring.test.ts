import { describe, expect, it } from "vitest";
import {
  calculateMonitoringEffectiveness,
  coveragePercent,
  evaluateKriResult,
  getKriSubmissionStatus,
  getOrcaMonitoringStatus,
  managementAttention,
  residualBand,
  validateThreshold,
} from "../server/riskMonitoring";

const lowerIsBetter = {
  mode: "LOWER_IS_BETTER",
  goodMin: 0,
  goodMax: 0,
  warningMin: 1,
  warningMax: 1,
  breachMin: 2,
  breachMax: null,
};

const higherIsBetter = {
  mode: "HIGHER_IS_BETTER",
  goodMin: 95,
  goodMax: null,
  warningMin: 85,
  warningMax: 94.99,
  breachMin: null,
  breachMax: 84.99,
};

describe("ORCA monitoring status", () => {
  it("is Not Assessed until a monitoring requirement is set", () => {
    expect(
      getOrcaMonitoringStatus({
        kriMonitoringRequired: null,
        mappedKris: [],
        openReviewCount: 0,
      }),
    ).toBe("Not Assessed");
  });

  it("is Not Required when monitoring is explicitly off", () => {
    expect(
      getOrcaMonitoringStatus({
        kriMonitoringRequired: false,
        mappedKris: [],
        openReviewCount: 0,
      }),
    ).toBe("Not Required");
  });

  it("is Unmapped when monitoring is required and no active KRI exists", () => {
    expect(
      getOrcaMonitoringStatus({
        kriMonitoringRequired: true,
        mappedKris: [{ archivedAt: new Date() }],
        openReviewCount: 0,
      }),
    ).toBe("Unmapped");
  });

  it("is Covered when an active mapped KRI has threshold, owner, and frequency", () => {
    expect(
      getOrcaMonitoringStatus({
        kriMonitoringRequired: true,
        mappedKris: [
          {
            owner: "IAM Lead",
            frequency: "MONTHLY",
            hasStructuredThreshold: true,
            thresholdMode: "LOWER_IS_BETTER",
          },
        ],
        openReviewCount: 0,
      }),
    ).toBe("Covered");
  });

  it("is Review Required when a mapped KRI has an open breach review", () => {
    expect(
      getOrcaMonitoringStatus({
        kriMonitoringRequired: true,
        mappedKris: [
          {
            owner: "IAM Lead",
            frequency: "MONTHLY",
            hasStructuredThreshold: true,
            thresholdMode: "LOWER_IS_BETTER",
          },
        ],
        openReviewCount: 1,
      }),
    ).toBe("Review Required");
  });
});

describe("structured KRI evaluation", () => {
  it("evaluates lower-is-better offboarding counts including boundaries", () => {
    expect(evaluateKriResult(lowerIsBetter, 0)).toBe("Good");
    expect(evaluateKriResult(lowerIsBetter, 1)).toBe("Warning");
    expect(evaluateKriResult(lowerIsBetter, 2)).toBe("Breached");
    expect(evaluateKriResult(lowerIsBetter, 3)).toBe("Breached");
  });

  it("evaluates higher-is-better patching percentages including boundaries", () => {
    expect(evaluateKriResult(higherIsBetter, 95)).toBe("Good");
    expect(evaluateKriResult(higherIsBetter, 91.4)).toBe("Warning");
    expect(evaluateKriResult(higherIsBetter, 85)).toBe("Warning");
    expect(evaluateKriResult(higherIsBetter, 84.99)).toBe("Breached");
  });

  it("does not calculate RAG for manual KRIs", () => {
    expect(evaluateKriResult({ mode: "MANUAL" }, 3)).toBeNull();
  });

  it("rejects overlapping threshold bands", () => {
    expect(() =>
      validateThreshold({
        mode: "LOWER_IS_BETTER",
        goodMin: 0,
        goodMax: 2,
        warningMin: 1,
        warningMax: 3,
        breachMin: 4,
        breachMax: null,
      }),
    ).toThrow(/overlap/i);
  });
});

describe("KRI submission status", () => {
  const now = new Date(2026, 7, 15);
  it("marks the current month due when nothing is submitted", () => {
    expect(
      getKriSubmissionStatus({
        frequency: "MONTHLY",
        periodYear: 2026,
        periodMonth: 8,
        now,
        hasSubmission: false,
        openReview: false,
      }),
    ).toBe("DUE");
  });

  it("marks a past month overdue when nothing is submitted", () => {
    expect(
      getKriSubmissionStatus({
        frequency: "MONTHLY",
        periodYear: 2026,
        periodMonth: 7,
        now,
        hasSubmission: false,
        openReview: false,
      }),
    ).toBe("OVERDUE");
  });

  it("marks a breached submission with an open review as review required", () => {
    expect(
      getKriSubmissionStatus({
        frequency: "MONTHLY",
        periodYear: 2026,
        periodMonth: 8,
        now,
        status: "Breached",
        hasSubmission: true,
        openReview: true,
      }),
    ).toBe("REVIEW_REQUIRED");
  });

  it("does not treat Good or Warning as a risk review", () => {
    expect(
      getKriSubmissionStatus({
        periodYear: 2026,
        periodMonth: 8,
        now,
        status: "Warning",
        hasSubmission: true,
        openReview: false,
      }),
    ).toBe("SUBMITTED");
  });
});

describe("coverage and effectiveness", () => {
  it("computes KRI coverage from required risks only", () => {
    expect(
      coveragePercent({
        monitoringRequired: 3,
        covered: 1,
        reviewRequired: 1,
      }),
    ).toBeCloseTo(66.666, 2);
  });

  it("scores monitoring effectiveness without using ORCA residual ratings", () => {
    const result = calculateMonitoringEffectiveness({
      coveragePercent: 67,
      onTimeSubmissionPercent: 88,
      resolvedReviewPercent: 80,
      criticalCoveragePercent: 78,
    });
    expect(result.score).toBeGreaterThan(60);
    expect(result.score).toBeLessThanOrEqual(80);
    expect(result.label).toBe("Good");
  });

  it("bands residual scores independently of KRI RAG", () => {
    expect(residualBand(16)).toBe("Critical");
    expect(residualBand(12)).toBe("High");
    expect(residualBand(9)).toBe("Medium");
    expect(residualBand(4)).toBe("Low");
  });

  it("flags unmapped required risks as unmonitored exposure", () => {
    expect(
      managementAttention({
        monitoringStatus: "Unmapped",
        residualBand: "High",
      }),
    ).toBe("Unmonitored Exposure");
  });
});
