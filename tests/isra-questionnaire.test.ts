import { describe, expect, it } from "vitest";
import { israImportSchema } from "../server/isra";
import {
  buildDaxonQuestions,
  buildDaxonSubmission,
  canonicalDepartmentName,
  inventoryListQuestionIds,
  mergeSystemOwners,
  parseDaxonList,
  procedureGuides,
  serializeDaxonList,
  serializeSystemOwners,
  validateDaxonAnswer,
} from "../client/src/israQuestionnaire";

function completeAnswers() {
  const answers: Record<string, string> = {};
  for (const question of buildDaxonQuestions())
    answers[question.id] = question.options?.[0]?.value || "Completed response";
  Object.assign(answers, {
    "risk.0.process": "Customer onboarding",
    "risk.0.description":
      "Risk of unauthorized access to onboarding records Due to excessive permissions Resulting in exposure of customer information.",
    "risk.0.inherentLikelihood": "4",
    "risk.0.inherentImpact": "5",
    "risk.0.existingControls": serializeDaxonList([
      "MFA",
      "Quarterly access reviews",
    ]),
    "risk.0.controlEffectiveness": "75",
    "risk.0.controlRemarks": "Controls are tested with minor gaps.",
    "risk.0.residualLikelihood": "2",
    "risk.0.residualImpact": "3",
    "risk.0.treatment": "Mitigate",
    "risk.0.actionPlan": "Automate access recertification",
    "risk.0.actionOwner": "Onboarding Lead",
    "risk.0.commitmentDate": "2026-12-01",
    "risk.0.evidenceLink": "https://example.com/access-review",
    "risk.0.more": "No",
    "respondent.name": "Process Owner",
    department: "Customer Experience",
  });
  return answers;
}

describe("Daxon guided ISRA", () => {
  it("incorporates procedure Parts 1 through 9", () => {
    expect(procedureGuides.map((guide) => guide.part)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("asks for one risk at a time without asking for a risk count", () => {
    const questions = buildDaxonQuestions();
    expect(questions.some((question) => question.id === "risk.count")).toBe(
      false,
    );
    expect(
      questions.find((question) => question.id === "risk.0.description")
        ?.prompt,
    ).toBe("What information security risk do you want to raise today?");
    expect(
      questions.some((question) => question.id === "risk.1.description"),
    ).toBe(false);
    expect(
      questions.find((question) => question.id === "risk.0.more"),
    ).toMatchObject({
      prompt: "Do you have more risk to add?",
      help: "Tip: There are more risks than you think in every information that you hold.",
    });
  });

  it("repeats only the risk questions when another risk is added", () => {
    const questions = buildDaxonQuestions(2);
    expect(
      questions.filter((question) => question.id === "discovery.1.1"),
    ).toHaveLength(1);
    expect(
      questions.some((question) => question.id === "risk.1.description"),
    ).toBe(true);
    expect(questions.some((question) => question.id === "risk.1.more")).toBe(
      true,
    );
  });

  it("mandates Risk of, Due to, Resulting in risk descriptions", () => {
    const question = buildDaxonQuestions().find(
      (item) => item.id === "risk.0.description",
    )!;
    expect(
      validateDaxonAnswer(question, "Unauthorized access may expose data"),
    ).toMatch(/required format/);
    expect(
      validateDaxonAnswer(
        question,
        "Risk of unauthorized access Due to excessive permissions Resulting in exposure of customer data",
      ),
    ).toBeNull();
  });

  it("forces inventory questions into a named list", () => {
    const questions = buildDaxonQuestions();
    for (const id of inventoryListQuestionIds) {
      const question = questions.find((item) => item.id === id)!;
      expect(question.type).toBe("list");
      expect(question.prompt).toMatch(/one short name per row/i);
    }
    const dataQuestion = questions.find(
      (item) => item.id === "discovery.2.1",
    )!;
    expect(validateDaxonAnswer(dataQuestion, "")).toMatch(/named item/);
    expect(validateDaxonAnswer(dataQuestion, "None")).toBeNull();
    expect(
      validateDaxonAnswer(
        dataQuestion,
        serializeDaxonList(["Customer records", "Vendor contracts"]),
      ),
    ).toBeNull();
    expect(
      validateDaxonAnswer(
        dataQuestion,
        serializeDaxonList(["Customer records", "None"]),
      ),
    ).toMatch(/Remove “None”/);
    expect(parseDaxonList("• Customer records\n• Vendor contracts")).toEqual([
      "Customer records",
      "Vendor contracts",
    ]);
    expect(
      validateDaxonAnswer(
        dataQuestion,
        serializeDaxonList([
          `${"A".repeat(80)} customer records used by onboarding, collections, and finance with supporting notes`,
        ]),
      ),
    ).toBeNull();
  });

  it("asks named-item questions as lists instead of long text", () => {
    const questions = buildDaxonQuestions();
    const listIds = [
      "discovery.1.1",
      "discovery.1.2",
      "discovery.1.3",
      "discovery.2.1",
      "discovery.3.1",
      "discovery.3.3",
      "discovery.4.1",
      "discovery.4.2",
      "discovery.4.3",
      "discovery.4.5",
      "discovery.5.1",
      "discovery.5.3",
      "discovery.7.1",
      "discovery.7.2",
      "discovery.7.3",
      "discovery.8.1",
      "discovery.8.2",
      "discovery.8.3",
      "risk.0.existingControls",
    ];
    expect(
      questions.filter((question) => question.type === "list").map((q) => q.id),
    ).toEqual(listIds);
    const narrativeIds = [
      "discovery.2.2",
      "discovery.2.3",
      "discovery.3.2",
      "discovery.4.4",
      "discovery.6.1",
      "discovery.6.2",
      "discovery.6.3",
      "risk.0.description",
      "risk.0.controlRemarks",
      "risk.0.actionPlan",
      "risk.0.evidenceLink",
    ];
    for (const id of narrativeIds) {
      expect(questions.find((item) => item.id === id)?.type).toBe("textarea");
    }
    const processQuestion = questions.find(
      (item) => item.id === "discovery.1.1",
    )!;
    expect(validateDaxonAnswer(processQuestion, "")).toMatch(/named item/);
    expect(validateDaxonAnswer(processQuestion, "None")).toBeNull();
    expect(
      validateDaxonAnswer(
        processQuestion,
        serializeDaxonList(["Customer onboarding", "Collections"]),
      ),
    ).toBeNull();
  });

  it("lists owners and admins for each previously named system", () => {
    const question = buildDaxonQuestions().find(
      (item) => item.id === "discovery.5.2",
    )!;
    expect(question).toMatchObject({
      type: "list-followup",
      sourceQuestionId: "discovery.5.1",
    });
    const source = {
      "discovery.5.1": serializeDaxonList([
        "JumpCloud",
        "Google Workspace",
        "Slack",
      ]),
    };
    expect(validateDaxonAnswer(question, "None", source)).toMatch(/owner/i);
    expect(
      validateDaxonAnswer(
        question,
        serializeSystemOwners([
          {
            item: "JumpCloud",
            owner: "Julius Faa",
            admins: "Julius Faa, Jayson Erasga",
          },
          {
            item: "Google Workspace",
            owner: "Julius Faa",
            admins: "Julius Faa, Jayson Erasga, Patrick Galinato",
          },
        ]),
        source,
      ),
    ).toMatch(/Slack/);
    const value = serializeSystemOwners([
      {
        item: "JumpCloud",
        owner: "Julius Faa",
        admins:
          "Julius Faa, Jayson Erasga, Patrick Galinato, John Del Rosario, Jan Almazora, Jess Sagarbaria",
      },
      {
        item: "Google Workspace",
        owner: "Julius Faa",
        admins: "Julius Faa, Jayson Erasga, Patrick Galinato",
      },
      {
        item: "Slack",
        owner: "Nichel Gaba",
        admins: "Julius Faa, Jayson Erasga",
      },
    ]);
    expect(validateDaxonAnswer(question, value, source)).toBeNull();
    expect(
      mergeSystemOwners(
        ["JumpCloud", "Google Workspace"],
        "Jumpcloud - Julius Faa (Owner); Admin - Julius Faa, Jayson Erasga\nGoogle Workspace - Julius Faa (Owner); Admin - Julius Faa, Jayson Erasga, Patrick Galinato",
      ),
    ).toEqual([
      {
        item: "JumpCloud",
        owner: "Julius Faa",
        admins: "Julius Faa, Jayson Erasga",
      },
      {
        item: "Google Workspace",
        owner: "Julius Faa",
        admins: "Julius Faa, Jayson Erasga, Patrick Galinato",
      },
    ]);
  });

  it("lets respondents type a new department name", () => {
    const question = buildDaxonQuestions().find(
      (item) => item.id === "department",
    )!;
    expect(question.type).toBe("text");
    expect(question.help).toMatch(/ISRA SPOG/);
    expect(validateDaxonAnswer(question, "Retail Banking")).toBeNull();
    expect(validateDaxonAnswer(question, "A".repeat(201))).toMatch(
      /200 characters/,
    );
    expect(
      canonicalDepartmentName("retail banking", [
        { department: "Retail Banking", departmentKey: "retail banking" },
      ]),
    ).toBe("Retail Banking");
    expect(
      canonicalDepartmentName("  New Squad  ", [
        { department: "Retail Banking", departmentKey: "retail banking" },
      ]),
    ).toBe("New Squad");
  });

  it("allows evidence to be skipped or entered as a non-link reference", () => {
    const question = buildDaxonQuestions().find(
      (item) => item.id === "risk.0.evidenceLink",
    )!;
    expect(question.type).toBe("textarea");
    expect(validateDaxonAnswer(question, "")).toBeNull();
    expect(
      validateDaxonAnswer(question, "ServiceDesk ticket SEC-1042"),
    ).toBeNull();
  });

  it("builds a valid department-routed ISRA submission", () => {
    const result = buildDaxonSubmission(
      completeAnswers(),
      new Date("2026-08-14T00:00:00.000Z"),
    );
    expect(result).toMatchObject({
      department: "Customer Experience",
      sourceType: "Daxon Questionnaire",
      respondentName: "Process Owner",
    });
    expect(result.risks[0]).toMatchObject({
      riskReference: "DX-20260814-01",
      inherentScore: 20,
      inherentRating: "Critical",
      controlEffectiveness: 0.75,
      residualScore: 6,
      residualRating: "Moderate",
    });
    expect(israImportSchema.safeParse(result).success).toBe(true);
  });

  it("builds and accepts a multi-risk Daxon submission", () => {
    const answers = completeAnswers();
    for (const [key, value] of Object.entries(answers))
      if (key.startsWith("risk.0.") && key !== "risk.0.more")
        answers[key.replace("risk.0.", "risk.1.")] = value;
    answers["risk.0.more"] = "Yes";
    answers["risk.1.more"] = "No";
    answers["risk.1.description"] =
      "Risk of service outage Due to a single point of failure Resulting in interrupted customer onboarding.";
    const result = buildDaxonSubmission(
      answers,
      new Date("2026-08-14T00:00:00.000Z"),
    );
    expect(result.risks).toHaveLength(2);
    expect(result.risks.map((risk) => risk.riskReference)).toEqual([
      "DX-20260814-01",
      "DX-20260814-02",
    ]);
    expect(israImportSchema.safeParse(result).success).toBe(true);
  });

  it("rejects malformed Daxon risk descriptions on the server", () => {
    const result = buildDaxonSubmission(completeAnswers());
    expect(
      israImportSchema.safeParse({
        ...result,
        risks: [{ ...result.risks[0], description: "Unauthorized access" }],
      }).success,
    ).toBe(false);
  });
});
