import { describe, expect, it } from "vitest";
import {
  regulatoryGuide,
  searchClauses,
} from "../client/src/regulatoryGuide";

describe("Regulatory Guide", () => {
  it("loads every area from the IT risk management standards", () => {
    expect(regulatoryGuide.areas).toEqual(
      expect.arrayContaining([
        "IT Audit",
        "Information Security",
        "IT Operations",
        "IT Outsourcing / Vendor Management",
      ]),
    );
    expect(regulatoryGuide.clauses.length).toBeGreaterThan(100);
  });

  it("points a topic or clause number to matching regulation text", () => {
    const byNumber = searchClauses("3.1 independence");
    expect(byNumber[0]?.ref).toMatch(/^3/);
    const vendors = searchClauses("outsourcing vendor");
    expect(vendors.some((clause) => /outsource|vendor/i.test(clause.area + clause.text))).toBe(
      true,
    );
  });
});
