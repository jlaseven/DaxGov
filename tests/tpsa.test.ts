import { describe, expect, it } from "vitest";
import {
  certificationExpiration,
  nextTpsaId,
  passedVerdictBlockers,
  tpsaChangeIssues,
  tpsaMetrics,
  tpsaProgress,
  tpsaSchema,
} from "../server/tpsa";

const now = new Date(2026, 6, 18);
const base = {
  vendorName: "Secure Cloud Vendor",
  productService: "Cloud hosting",
  reviewerName: "Cybersecurity Reviewer",
  vendorType: "Existing Vendor",
  vendorTier: "Not Yet Assigned",
  assessmentType: "Full TPSA",
  status: "Draft",
  verdict: "Pending",
  requiredEvidenceReceived: false,
  cybersecurityReviewCompleted: false,
  openCriticalFindings: 0,
  openHighFindings: 0,
  openMediumFindings: 0,
  openLowFindings: 0,
  highFindingsTreatmentStatus: "Not Applicable",
  rafStatus: "Not Required",
};

describe("TPSA calculations and validation", () => {
  it("generates sequential year-based TPSA IDs", () => {
    expect(nextTpsaId(2026)).toBe("TPSA-2026-0001");
    expect(nextTpsaId(2026, "TPSA-2026-0099")).toBe("TPSA-2026-0100");
  });
  it("calculates outstanding and overdue days", () => {
    const open = tpsaMetrics(
      {
        sentDate: new Date(2026, 6, 1),
        submissionDeadline: new Date(2026, 6, 10),
        certifications: [],
      },
      now,
    );
    expect(open.daysOutstanding).toBe(17);
    expect(open.daysOverdue).toBe(8);
    expect(
      tpsaMetrics(
        {
          sentDate: new Date(2026, 6, 1),
          submissionDeadline: new Date(2026, 6, 10),
          submittedDate: new Date(2026, 6, 13),
          certifications: [],
        },
        now,
      ).daysOverdue,
    ).toBe(3);
    expect(
      tpsaMetrics(
        {
          sentDate: new Date(2026, 6, 1),
          submissionDeadline: new Date(2026, 6, 10),
          submittedDate: new Date(2026, 6, 9),
          certifications: [],
        },
        now,
      ).daysOverdue,
    ).toBe(0);
  });
  it("summarizes sent TPSAs and completed outcomes", () => {
    expect(
      tpsaProgress([
        { sentDate: null, status: "Ready to Send" },
        { sentDate: now, status: "Completed" },
        { sentDate: now, status: "Under Cybersecurity Review" },
        { sentDate: null, status: "Completed" },
      ]),
    ).toEqual({
      readyToSend: 1,
      sent: 2,
      completed: 1,
      completionRate: 50,
    });
  });
  it("calculates review and overdue reassessment days", () => {
    const metrics = tpsaMetrics(
      {
        reviewDeadline: new Date(2026, 6, 20),
        nextReassessmentDate: new Date(2026, 6, 10),
        certifications: [],
      },
      now,
    );
    expect(metrics.reviewDaysRemaining).toBe(2);
    expect(metrics.reassessmentDaysRemaining).toBe(-8);
  });
  it("classifies certification expiration windows", () => {
    expect(certificationExpiration(null, now)).toBe(
      "No Expiration Date Provided",
    );
    expect(certificationExpiration(new Date(2026, 6, 17), now)).toBe("Expired");
    expect(certificationExpiration(new Date(2026, 7, 1), now)).toBe(
      "Expiring Within 30 Days",
    );
    expect(certificationExpiration(new Date(2026, 9, 20), now)).toBe(
      "Valid for More Than 90 Days",
    );
  });
  it("blocks Passed when critical requirements are incomplete", () => {
    const blockers = passedVerdictBlockers({
      ...base,
      verdict: "Passed",
      openCriticalFindings: 1,
    });
    expect(blockers).toContain(
      "Passed is blocked because an open Critical finding remains.",
    );
    expect(blockers).toContain(
      "Passed is blocked because the vendor submission date is missing.",
    );
  });
  it("validates URLs and chronological deadlines", () => {
    const invalid = tpsaSchema.safeParse({
      ...base,
      rafLink: "file:///secret",
      sentDate: "2026-07-10",
      submissionDeadline: "2026-07-01",
    });
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.error.issues.map((issue) => issue.path[0])).toEqual(
        expect.arrayContaining(["rafLink", "submissionDeadline"]),
      );
  });

  it("accepts the Security Assessment Failed verdict", () => {
    expect(
      tpsaSchema.safeParse({
        ...base,
        verdict: "Security Assessment Failed",
      }).success,
    ).toBe(true);
  });

  it("requires reasons for verdict, tier, and deadline changes", () => {
    const previous = {
      verdict: "Pending",
      vendorTier: "Tier 3 – Standard",
      submissionDeadline: new Date(2026, 6, 20),
      reviewDeadline: new Date(2026, 6, 21),
      remediationDeadline: new Date(2026, 6, 22),
      rafLink: "https://example.com/old",
    };
    const next = {
      ...previous,
      verdict: "Reassessment Required",
      vendorTier: "Tier 2 – High",
      submissionDeadline: new Date(2026, 6, 25),
      rafLink: "https://example.com/new",
    };
    expect(tpsaChangeIssues(previous, next, {})).toHaveLength(4);
    expect(
      tpsaChangeIssues(previous, next, {
        changeReason: "Risk profile changed",
        rafLinkReplacementConfirmed: true,
      }),
    ).toEqual([]);
  });

  it("uses the earliest active certification expiration", () => {
    const metrics = tpsaMetrics(
      {
        certifications: [
          { expirationDate: new Date(2026, 6, 1) },
          { expirationDate: new Date(2026, 7, 1) },
          { expirationDate: new Date(2026, 8, 1) },
        ],
      },
      now,
    );
    expect(metrics.earliestCertificationExpirationDate).toEqual(
      new Date(2026, 7, 1),
    );
  });

  it("requires an approved RAF for Risk Accepted High findings", () => {
    const blockers = passedVerdictBlockers({
      ...base,
      sentDate: now,
      submittedDate: now,
      cybersecurityReviewCompleted: true,
      reviewCompletedDate: now,
      requiredEvidenceReceived: true,
      openHighFindings: 1,
      highFindingsTreatmentStatus: "Risk Accepted",
      verdictJustification: "Reviewed",
      vendorTier: "Tier 3 – Standard",
      rafStatus: "Pending Approval",
    });
    expect(blockers).toContain(
      "Passed is blocked because Risk Accepted High findings require an approved RAF.",
    );
  });
});
