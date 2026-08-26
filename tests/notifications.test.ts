import { describe, expect, it } from "vitest";
import { buildNotifications } from "../server/notifications";

const now = new Date("2026-08-17T00:00:00.000Z");
const empty = {
  watched: [],
  documents: [],
  opir: [],
  audits: [],
  objectives: [],
  initiatives: [],
    tpsa: [],
    israRisks: [],
    assets: [],
    orca: [],
    kris: [],
  };

describe("buildNotifications", () => {
  it("returns nothing when registers are empty", () => {
    expect(buildNotifications(empty, now)).toEqual([]);
  });

  it("notifies overdue and due-soon OPIR and audit items, and skips closed work", () => {
    const notices = buildNotifications(
      {
        ...empty,
        opir: [
          {
            id: 1,
            opirNumber: "OPIR-1",
            incidentTitle: "Overdue high",
            riskRating: "High",
            actionStatus: "In Progress",
            originalTargetDate: new Date("2026-08-01"),
          },
          {
            id: 2,
            opirNumber: "OPIR-2",
            incidentTitle: "Due soon",
            riskRating: "Low",
            actionStatus: "Todo",
            originalTargetDate: new Date("2026-08-20"),
          },
          {
            id: 3,
            opirNumber: "OPIR-3",
            incidentTitle: "Completed overdue",
            riskRating: "Critical",
            actionStatus: "Completed",
            originalTargetDate: new Date("2026-08-01"),
          },
        ],
        audits: [
          {
            id: 10,
            findingNumber: "AF-10",
            auditObservation: "Open overdue",
            riskLevel: "Medium",
            findingStatus: "Open",
            originalTargetDate: new Date("2026-08-10"),
          },
          {
            id: 11,
            findingNumber: "AF-11",
            auditObservation: "Closed high",
            riskLevel: "High",
            findingStatus: "Closed",
            originalTargetDate: new Date("2026-08-01"),
          },
        ],
      },
      now,
    );
    const byKey = Object.fromEntries(notices.map((item) => [item.key, item]));
    expect(byKey["opir-actions:1"].flags).toEqual(
      expect.arrayContaining(["overdue", "high-risk"]),
    );
    expect(byKey["opir-actions:1"].severity).toBe("high");
    expect(byKey["opir-actions:2"].flags).toContain("due-soon");
    expect(byKey["opir-actions:2"].severity).toBe("medium");
    expect(byKey["opir-actions:3"]).toBeUndefined();
    expect(byKey["audit-findings:10"].flags).toContain("overdue");
    expect(byKey["audit-findings:11"]).toBeUndefined();
  });

  it("notifies initiative due dates and calculated at-risk status", () => {
    const notices = buildNotifications(
      {
        ...empty,
        initiatives: [
          {
            id: 5,
            initiativeName: "Access recertification",
            status: "In Progress",
            endDate: new Date("2026-08-25"),
            subInitiatives: [{ status: "In Progress – At Risk" }],
          },
          {
            id: 6,
            initiativeName: "Finished work",
            status: "Done",
            endDate: new Date("2026-08-01"),
            subInitiatives: [{ status: "Done" }],
          },
        ],
      },
      now,
    );
    const open = notices.find((item) => item.key === "initiatives:5");
    expect(open?.flags).toEqual(expect.arrayContaining(["due-soon", "at-risk"]));
    expect(open?.severity).toBe("medium");
    expect(notices.some((item) => item.key === "initiatives:6")).toBe(false);
  });

  it("notifies high-risk items, outdated documents, and starred records", () => {
    const notices = buildNotifications(
      {
        ...empty,
        watched: [
          { entityType: "documents", entityId: "2" },
          { entityType: "objectives", entityId: "9" },
        ],
        documents: [
          { id: 1, documentName: "Old policy", status: "Outdated" },
          { id: 2, documentName: "Current standard", status: "Updated" },
        ],
        objectives: [
          {
            id: 9,
            objectiveId: "OKR-9",
            objectiveName: "Starred OKR",
            endDate: new Date("2026-12-01"),
            tasks: [{ taskStatus: "Todo" }],
          },
        ],
        tpsa: [
          {
            id: 4,
            tpsaReference: "TPSA-2026-0004",
            vendorName: "Vendor",
            submittedDate: null,
            submissionDeadline: new Date("2026-08-10"),
            openCriticalFindings: 1,
            openHighFindings: 0,
          },
        ],
        israRisks: [
          {
            id: 8,
            riskReference: "R-8",
            description: "Access risk",
            inherentRating: "Critical",
            commitmentDate: new Date("2026-09-01"),
          },
        ],
        assets: [{ id: 3, assetName: "Core banking", riskLevel: "High" }],
      },
      now,
    );
    const byKey = Object.fromEntries(notices.map((item) => [item.key, item]));
    expect(byKey["documents:1"].flags).toContain("attention");
    expect(byKey["documents:2"].flags).toEqual(["important"]);
    expect(byKey["documents:2"].severity).toBe("low");
    expect(byKey["objectives:9"].flags).toEqual(["important"]);
    expect(byKey["tpsa-records:4"].flags).toEqual(
      expect.arrayContaining(["overdue", "high-risk"]),
    );
    expect(byKey["isra-risks:8"].flags).toEqual(
      expect.arrayContaining(["due-soon", "high-risk"]),
    );
    expect(byKey["information-assets:3"].flags).toContain("high-risk");
    expect(notices[0].severity).toBe("high");
  });

  it("notifies starred ORCA risks and high inherent scores", () => {
    const notices = buildNotifications(
      {
        ...empty,
        watched: [{ entityType: "orca", entityId: "2" }],
        orca: [
          {
            id: 1,
            riskNo: "CYB-2-1",
            riskThreat: "Delayed detection",
            inherentRiskScore: 25,
            status: "Open",
          },
          {
            id: 2,
            riskNo: "CYB-5-2",
            riskThreat: "Stolen devices",
            inherentRiskScore: 12,
            status: "Open",
          },
        ],
      },
      now,
    );
    const byKey = Object.fromEntries(notices.map((item) => [item.key, item]));
    expect(byKey["orca:1"].flags).toContain("high-risk");
    expect(byKey["orca:2"].flags).toEqual(["important"]);
  });

  it("notifies breached KRIs", () => {
    const notices = buildNotifications(
      {
        ...empty,
        kris: [
          {
            id: 4,
            riskName: "[CS-6-1] Unauthorized access",
            kriNumber: "KRI 1",
            keyRiskIndicator: "Offboarding",
            janResult: "Breached",
          },
        ],
      },
      now,
    );
    expect(notices.find((item) => item.key === "kri-records:4")?.flags).toContain(
      "attention",
    );
  });
});
