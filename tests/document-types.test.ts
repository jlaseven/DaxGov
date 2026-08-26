import { describe, expect, it } from "vitest";
import {
  documentStatusPies,
  documentTypeFromName,
} from "../server/documentTypes";

describe("governance document type from name", () => {
  it("reads procedure, policy, and framework from the document name", () => {
    expect(documentTypeFromName("Access Control Policy")).toBe("Policy");
    expect(documentTypeFromName("Incident Response Procedure")).toBe(
      "Procedure",
    );
    expect(documentTypeFromName("Vendor Onboarding SOP")).toBe("Procedure");
    expect(documentTypeFromName("NIST Cybersecurity Framework")).toBe(
      "Framework",
    );
    expect(documentTypeFromName("Board Charter")).toBe("Other");
  });

  it("uses the last type word when more than one appears", () => {
    expect(documentTypeFromName("Enterprise Policy Framework")).toBe(
      "Framework",
    );
    expect(documentTypeFromName("Framework Implementation Policy")).toBe(
      "Policy",
    );
  });

  it("builds overall and per-type status pies", () => {
    const pies = documentStatusPies([
      { documentName: "Acceptable Use Policy", status: "Updated" },
      { documentName: "Password Policy", status: "Outdated" },
      { documentName: "Backup Procedure", status: "For Decommissioning" },
      { documentName: "Logging Procedure", status: "Non-existent" },
      { documentName: "Risk Framework", status: "Currently Updating" },
      { documentName: "Board Minutes", status: "Updated" },
    ]);
    expect(pies.counts).toEqual({
      procedure: 2,
      policy: 2,
      framework: 1,
      other: 1,
    });
    expect(pies.overall).toEqual([
      { name: "Updated", value: 2 },
      { name: "Outdated", value: 1 },
      { name: "Currently Updating", value: 1 },
      { name: "Non-existent", value: 1 },
      { name: "For Decommissioning", value: 1 },
    ]);
    expect(pies.policy).toEqual([
      { name: "Updated", value: 1 },
      { name: "Outdated", value: 1 },
    ]);
    expect(pies.procedure.map((item) => item.name)).toEqual([
      "Non-existent",
      "For Decommissioning",
    ]);
  });
});
