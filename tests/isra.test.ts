import { describe, expect, it } from "vitest";
import { parseIsraRows } from "../client/src/israImport";
import {
  applyIsraRiskUpdate,
  departmentKey,
  israActionDueStatus,
  israRating,
  israRiskUpdateSchema,
  normalizeDepartmentName,
} from "../server/isra";

const currentHeaders = [
  "ID",
  "Process",
  "Risk Description",
  "Inherent Likelihood (1-5)",
  "Inherent Impact (1-5)",
  "Inherent Risk Score",
  "Existing Controls",
  "Control Effectiveness (0-100%)",
  "Control Effectiveness Remarks",
  "Residual Likelihood",
  "Residual Impact",
  "Residual Risk Score",
  "Risk Treatment",
  "Action Plan / Owner",
  "Commitment Date",
  "Evidence Link",
];

describe("ISRA import and analysis", () => {
  it("parses the current 16-column ISRA format", () => {
    const result = parseIsraRows(
      [
        [
          "R-01",
          "Cloud Storage",
          "Ransomware encryption of backup files",
          4,
          5,
          20,
          "Immutable backups",
          "75%",
          "Effective",
          2,
          3,
          6,
          "Mitigate",
          "Audit immutable flags | Security Team",
          "2026-09-30",
          "https://example.com/evidence",
        ],
      ],
      currentHeaders,
    );
    expect(result.risks).toHaveLength(1);
    expect(result.risks[0]).toMatchObject({
      riskReference: "R-01",
      inherentScore: 20,
      inherentRating: "Critical",
      residualScore: 6,
      residualRating: "Moderate",
      controlEffectiveness: 0.75,
      actionOwner: "Security Team",
    });
    expect(result.findings).toEqual([]);
  });

  it("accepts the older 12-column Risk Register format", () => {
    const headers = currentHeaders.filter(
      (header) =>
        ![
          "Control Effectiveness Remarks",
          "Residual Likelihood",
          "Residual Impact",
          "Evidence Link",
        ].includes(header),
    );
    const result = parseIsraRows(
      [
        [
          "R-02",
          "Identity",
          "Privileged access misuse",
          3,
          4,
          12,
          "PAM",
          0.8,
          5,
          "Treat",
          "Review access; Owner: IAM Lead",
          new Date(2026, 9, 1),
        ],
      ],
      headers,
    );
    expect(result.risks[0]).toMatchObject({
      inherentRating: "High",
      residualRating: "Low",
      actionOwner: "IAM Lead",
    });
  });

  it("reports invalid values and duplicate IDs for manual review", () => {
    const rows = [
      [
        "R-03",
        "Payments",
        "Fraud",
        7,
        5,
        35,
        "",
        "bad%",
        "",
        "",
        "",
        30,
        "",
        "",
        "bad date",
        "",
      ],
      [
        "R-03",
        "Payments",
        "Fraud copy",
        4,
        5,
        20,
        "Control",
        0.5,
        "",
        2,
        2,
        4,
        "Treat",
        "Plan | Owner",
        "2026-10-01",
        "",
      ],
    ];
    const result = parseIsraRows(rows, currentHeaders);
    expect(result.findings.map((finding) => finding.category)).toEqual(
      expect.arrayContaining([
        "Invalid likelihood or impact values",
        "Invalid percentages",
        "Invalid dates",
        "Duplicate risk IDs",
      ]),
    );
    expect(result.risks[0].manualReview).toBe(true);
  });

  it("normalizes department keys and applies the 5x5 rating thresholds", () => {
    expect(departmentKey("  Information   Security ")).toBe(
      "information security",
    );
    expect(normalizeDepartmentName("  Information   Security ")).toBe(
      "Information Security",
    );
    expect([1, 6, 12, 20].map(israRating)).toEqual([
      "Low",
      "Moderate",
      "High",
      "Critical",
    ]);
  });

  it("recalculates scores and ratings when an ISRA risk is edited", () => {
    const updated = applyIsraRiskUpdate(
      {
        inherentLikelihood: 2,
        inherentImpact: 2,
        residualLikelihood: 1,
        residualImpact: 1,
      },
      israRiskUpdateSchema.parse({
        inherentLikelihood: 4,
        inherentImpact: 5,
        residualLikelihood: 2,
        residualImpact: 3,
        actionOwner: "IAM Lead",
        commitmentDate: "2026-09-30",
      }),
    );
    expect(updated).toMatchObject({
      inherentScore: 20,
      inherentRating: "Critical",
      residualScore: 6,
      residualRating: "Moderate",
      actionOwner: "IAM Lead",
      manualReview: true,
    });
    expect(updated.rawCommitmentDate).toBe("2026-09-30");
    expect((updated.commitmentDate as Date).getFullYear()).toBe(2026);
    expect((updated.commitmentDate as Date).getMonth()).toBe(8);
    expect((updated.commitmentDate as Date).getDate()).toBe(30);
  });

  it("classifies ISRA treatment due status", () => {
    const now = new Date("2026-08-17T12:00:00");
    expect(israActionDueStatus({}, now)).toBe("Missing");
    expect(
      israActionDueStatus({ commitmentDate: new Date("2026-08-01") }, now),
    ).toBe("Overdue");
    expect(
      israActionDueStatus({ commitmentDate: new Date("2026-09-01") }, now),
    ).toBe("Due ≤30 days");
  });
});
