import { israRating } from "./israImport";

export const procedureGuides = [
  {
    part: 1,
    title: "Purpose and Objective",
    summary:
      "Identify, assess, treat, document, review, and report information security risks consistently and with evidence.",
  },
  {
    part: 2,
    title: "Scope",
    summary:
      "Covers new or changed systems, processes, infrastructure, third parties, incidents, findings, requests, and information-handling changes.",
  },
  {
    part: 3,
    title: "Roles and Responsibilities",
    summary:
      "Process owners provide context, control owners evidence safeguards, action owners deliver improvements, and Cybersecurity facilitates the assessment.",
  },
  {
    part: 4,
    title: "Periodic Review",
    summary:
      "Assessments are reviewed at least annually and whenever material changes, incidents, findings, or governance requests occur.",
  },
  {
    part: 5,
    title: "Key Terms",
    summary:
      "Inherent risk exists before controls; control effectiveness reflects implemented safeguards; residual risk remains after controls.",
  },
  {
    part: 6,
    title: "Procedure Guide",
    summary:
      "Define clear risk scenarios, score likelihood and impact, assess existing controls, determine residual risk, and assign treatment actions.",
  },
  {
    part: 7,
    title: "Reporting",
    summary:
      "Results support reporting on risk volumes, high residual exposure, overdue actions, accepted risks, control gaps, and remediation progress.",
  },
  {
    part: 8,
    title: "Exceptions and Escalation",
    summary:
      "Methodology deviations require rationale and approval. High residual risks, overdue remediation, and out-of-appetite acceptance must be escalated.",
  },
  {
    part: 9,
    title: "Compliance",
    summary:
      "Incomplete or inaccurate assessments can leave risks unmanaged and may be escalated under applicable governance requirements.",
  },
];

export type DaxonQuestion = {
  id: string;
  section: number;
  sectionTitle: string;
  prompt: string;
  help?: string;
  type?: "text" | "textarea" | "select" | "date" | "url" | "list" | "list-followup";
  options?: { value: string; label: string }[];
  placeholder?: string;
  sourceQuestionId?: string;
  required?: boolean;
};

export type SystemOwnerRow = {
  item: string;
  owner: string;
  admins: string;
};

type DiscoveryQuestion =
  | string
  | Pick<
      DaxonQuestion,
      "prompt" | "help" | "type" | "placeholder" | "sourceQuestionId"
    >;

const noneListAnswerPattern =
  /^(?:none|n\/?a|not applicable|no information)$/i;

export const inventoryListQuestionIds = [
  "discovery.2.1",
  "discovery.5.1",
  "discovery.8.1",
] as const;

const defaultListHelp =
  "Add one named item per row. Choose None if nothing applies.";

function listQuestion(
  prompt: string,
  placeholder: string,
  help = defaultListHelp,
): Pick<DaxonQuestion, "prompt" | "help" | "type" | "placeholder"> {
  return { prompt, type: "list", placeholder, help };
}

const discoverySections: Array<{
  title: string;
  questions: DiscoveryQuestion[];
}> = [
  {
    title: "Department Processes and Responsibilities",
    questions: [
      listQuestion(
        "List the main processes or activities performed by your department. Add one short name per row.",
        "e.g. Customer onboarding",
      ),
      listQuestion(
        "List the processes considered critical to your daily operations. Add one short name per row.",
        "e.g. Payroll processing",
      ),
      listQuestion(
        "List any manual processes or spreadsheets your department heavily relies on. Add one short name per row.",
        "e.g. Monthly reconciliation spreadsheet",
      ),
    ],
  },
  {
    title: "Data and Information Handling",
    questions: [
      {
        prompt:
          "List each information asset your department manages or uses. Add one short name per row.",
        type: "list",
        placeholder: "e.g. Customer records",
        help: "Each row becomes one Information Asset Inventory entry. Use a name, not a sentence. Examples: Customer records · Payroll files · Vendor contracts.",
      },
      "Does your department handle confidential, personal, customer, financial, or other sensitive information?",
      "Does your department send or receive sensitive information through email, messaging applications, file-sharing platforms, or other channels?",
    ],
  },
  {
    title: "Data Storage and Backup",
    questions: [
      listQuestion(
        "List each place this information is stored. Add one short name per row.",
        "e.g. Google Drive",
        "Examples: shared drive, Google Drive, application, database, or local device. Choose None if nothing applies.",
      ),
      "Are copies or backups of the information maintained elsewhere?",
      listQuestion(
        "List any important files or records that are not currently backed up. Add one short name per row.",
        "e.g. Local desktop reports",
      ),
    ],
  },
  {
    title: "Access Management",
    questions: [
      listQuestion(
        "List who has access to this information or storage location. Add one name, role, or team per row.",
        "e.g. Department staff",
      ),
      listQuestion(
        "List any other departments that have access to your information or systems. Add one department per row.",
        "e.g. Finance",
      ),
      listQuestion(
        "List any external parties, vendors, or partners that have access to your information or systems. Add one short name per row.",
        "e.g. Payroll vendor",
      ),
      "How are new users given access, and how is access removed when someone transfers or leaves?",
      listQuestion(
        "List any shared accounts, shared passwords, or shared access currently being used. Add one short name per row.",
        "e.g. Shared inbox account",
      ),
    ],
  },
  {
    title: "Systems and Applications",
    questions: [
      {
        prompt:
          "List each application, system, or tool that is critical to your daily operations. Add one short name per row.",
        type: "list",
        placeholder: "e.g. Google Workspace",
        help: "Each row becomes one Information Asset Inventory entry. Use the product or system name only. Examples: Google Workspace · JumpCloud · Qualys.",
      },
      {
        prompt:
          "For each application or system you just listed, who is the owner and who are the administrators?",
        type: "list-followup",
        sourceQuestionId: "discovery.5.1",
        help: "Each row is one system from your previous answer. Enter the owner and the administrators separately. Separate multiple admins with commas.",
      },
      listQuestion(
        "List any of these systems that are managed or hosted by third parties. Add one short name per row.",
        "e.g. Google Workspace",
      ),
    ],
  },
  {
    title: "Business and Security Impact",
    questions: [
      "What would happen to your department if these systems or information became unavailable?",
      "What would happen if the information was accidentally deleted, changed, or disclosed to an unauthorized person?",
      "Could any of these events affect customers, operations, compliance, financial activities, or other departments?",
    ],
  },
  {
    title: "Known Issues and Incidents",
    questions: [
      listQuestion(
        "List any known security, access, system, or data-related issues within your department. Add one short name per row.",
        "e.g. Shared admin password",
      ),
      listQuestion(
        "List any incidents, system outages, data loss, unauthorized access, or similar issues affecting the department. Add one short name per row.",
        "e.g. Email outage in March",
      ),
      listQuestion(
        "List any recurring problems or workarounds that the department currently relies on. Add one short name per row.",
        "e.g. Manual access request via email",
      ),
    ],
  },
  {
    title: "Existing Controls and Improvements",
    questions: [
      {
        prompt:
          "List each existing control or practice that already protects your information and systems. Add one short name per row.",
        type: "list",
        placeholder: "e.g. Multi-factor authentication",
        help: "These controls are copied onto every inventory asset from this submission. Name only what is already in place. Examples: Multi-factor authentication · Quarterly access reviews · Encrypted laptops.",
      },
      listQuestion(
        "List any areas where additional security controls or improvements are needed. Add one short name per row.",
        "e.g. Access recertification",
      ),
      listQuestion(
        "List any risks or concerns that your department believes should be addressed. Add one short name per row.",
        "e.g. Unencrypted USB drives",
      ),
    ],
  },
];

const defaultDiscoveryHelp =
  "Share the relevant details. You may enter “None” or “Not applicable” when appropriate.";

const discoveryQuestions: DaxonQuestion[] = discoverySections.flatMap(
  (section, sectionIndex) =>
    section.questions.map((question, questionIndex) => {
      const details =
        typeof question === "string" ? { prompt: question } : question;
      return {
        id: `discovery.${sectionIndex + 1}.${questionIndex + 1}`,
        section: sectionIndex + 1,
        sectionTitle: section.title,
        prompt: details.prompt,
        type: details.type || "textarea",
        placeholder: details.placeholder,
        sourceQuestionId: details.sourceQuestionId,
        help:
          details.help ||
          (details.type === "list" ? defaultListHelp : defaultDiscoveryHelp),
      };
    }),
);

export function isNoneListAnswer(value: string) {
  return noneListAnswerPattern.test(value.trim());
}

function splitCommaSeparatedNames(line: string) {
  const stripped = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "");
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of stripped) {
    if (char === "(") depth += 1;
    else if (char === ")" && depth > 0) depth -= 1;
    if (depth === 0 && char === ",") {
      const piece = current.trim();
      if (piece) parts.push(piece);
      current = "";
      continue;
    }
    current += char;
  }
  const piece = current.trim();
  if (piece) parts.push(piece);
  return parts.length ? parts : [stripped];
}

export function parseDaxonList(value: string) {
  const items = String(value || "")
    .replaceAll("\r", "")
    .split(/\n+/)
    .flatMap(splitCommaSeparatedNames)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim())
    .filter(Boolean);
  return items.length ? items : [""];
}

export function serializeDaxonList(items: string[]) {
  const cleaned = items
    .map((item) =>
      item
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  if (!cleaned.length) return "";
  if (cleaned.length === 1 && isNoneListAnswer(cleaned[0])) return cleaned[0];
  return cleaned.map((item) => `• ${item}`).join("\n");
}

export function listedItemsFromAnswer(value: string) {
  return parseDaxonList(value).filter(
    (item) => item && !isNoneListAnswer(item),
  );
}

function parseSystemOwnerLine(line: string): SystemOwnerRow {
  const structured = line.match(
    /^(.*?)\s*[—–]\s*Owner:\s*(.*?);\s*Admins?:\s*(.*)$/i,
  );
  if (structured)
    return {
      item: structured[1].trim(),
      owner: structured[2].trim(),
      admins: structured[3].trim(),
    };
  const legacy = line.match(
    /^(.*?)\s*-\s*(.*?)\s*\(\s*Owner\s*\);\s*Admins?\s*-\s*(.*)$/i,
  );
  if (legacy)
    return {
      item: legacy[1].trim(),
      owner: legacy[2].trim(),
      admins: legacy[3].trim(),
    };
  const dashed = line.match(/^(.*?)\s*[-—–]\s*(.*)$/);
  if (dashed)
    return {
      item: dashed[1].trim(),
      owner: dashed[2].trim(),
      admins: "",
    };
  return { item: line, owner: "", admins: "" };
}

export function parseSystemOwners(value: string): SystemOwnerRow[] {
  return parseDaxonList(value)
    .filter((line) => line && !isNoneListAnswer(line))
    .map(parseSystemOwnerLine);
}

export function serializeSystemOwners(rows: SystemOwnerRow[]) {
  const cleaned = rows
    .map((row) => ({
      item: row.item.replace(/\s+/g, " ").trim(),
      owner: row.owner.replace(/\s+/g, " ").trim(),
      admins: row.admins.replace(/\s+/g, " ").trim(),
    }))
    .filter((row) => row.item);
  if (!cleaned.length) return "None";
  return cleaned
    .map(
      (row) =>
        `• ${row.item} — Owner: ${row.owner || "None"}; Admins: ${row.admins || "None"}`,
    )
    .join("\n");
}

export function mergeSystemOwners(
  sourceItems: string[],
  savedAnswer: string,
): SystemOwnerRow[] {
  const saved = parseSystemOwners(savedAnswer);
  const byName = new Map(
    saved.map((row) => [row.item.toLocaleLowerCase("en"), row]),
  );
  return sourceItems.map((item) => {
    const match = byName.get(item.toLocaleLowerCase("en"));
    return {
      item,
      owner: match?.owner || "",
      admins: match?.admins || "",
    };
  });
}

const scoreOptions = (labels: Record<number, string>) =>
  [1, 2, 3, 4, 5].map((value) => ({
    value: String(value),
    label: `${value} — ${labels[value]}`,
  }));

const likelihoodOptions = scoreOptions({
  1: "Rare",
  2: "Unlikely",
  3: "Possible",
  4: "Likely",
  5: "Frequent",
});
const impactOptions = scoreOptions({
  1: "Incidental",
  2: "Minor",
  3: "Moderate",
  4: "Major",
  5: "Critical",
});

function riskQuestions(index: number): DaxonQuestion[] {
  const title = `Risk Register Builder · Risk ${index + 1}`;
  const id = (field: string) => `risk.${index}.${field}`;
  return [
    {
      id: id("description"),
      section: 9,
      sectionTitle: title,
      prompt: "What information security risk do you want to raise today?",
      type: "textarea",
      help: "Required format: “Risk of [event] Due to [cause] Resulting in [impact].” Example: “Risk of unauthorized access to payroll files Due to excessive user permissions Resulting in exposure of employee personal information.”",
    },
    {
      id: id("process"),
      section: 9,
      sectionTitle: title,
      prompt:
        "Which process, system, application, service, or activity is affected by this risk?",
      type: "text",
    },
    {
      id: id("inherentLikelihood"),
      section: 9,
      sectionTitle: title,
      prompt: "Before considering existing controls, how likely is this risk?",
      type: "select",
      options: likelihoodOptions,
    },
    {
      id: id("inherentImpact"),
      section: 9,
      sectionTitle: title,
      prompt:
        "Before considering existing controls, how severe would the impact be?",
      type: "select",
      options: impactOptions,
    },
    {
      id: id("existingControls"),
      section: 9,
      sectionTitle: title,
      prompt:
        "List the controls already implemented to reduce this risk. Add one short name per row.",
      type: "list",
      placeholder: "e.g. Multi-factor authentication",
      help: "List implemented controls only—not planned improvements. Choose None if nothing is in place yet.",
    },
    {
      id: id("controlEffectiveness"),
      section: 9,
      sectionTitle: title,
      prompt: "How effective are those existing controls?",
      type: "select",
      options: [
        { value: "0", label: "0% — No effective control" },
        { value: "25", label: "25% — Weak or inconsistent" },
        { value: "50", label: "50% — Partially effective" },
        { value: "75", label: "75% — Generally effective" },
        { value: "100", label: "100% — Fully effective and evidenced" },
      ],
    },
    {
      id: id("controlRemarks"),
      section: 9,
      sectionTitle: title,
      prompt:
        "What evidence or reasoning supports that control-effectiveness rating?",
      type: "textarea",
    },
    {
      id: id("residualLikelihood"),
      section: 9,
      sectionTitle: title,
      prompt:
        "After considering the controls, what is the remaining likelihood?",
      type: "select",
      options: likelihoodOptions,
    },
    {
      id: id("residualImpact"),
      section: 9,
      sectionTitle: title,
      prompt: "After considering the controls, what is the remaining impact?",
      type: "select",
      options: impactOptions,
    },
    {
      id: id("treatment"),
      section: 9,
      sectionTitle: title,
      prompt: "How should the remaining risk be treated?",
      type: "select",
      options: [
        { value: "Mitigate", label: "Mitigate — add or improve controls" },
        {
          value: "Accept",
          label: "Accept — retain with approval and rationale",
        },
        { value: "Transfer", label: "Transfer — shift part of the risk" },
        { value: "Avoid", label: "Avoid — discontinue or do not pursue" },
      ],
    },
    {
      id: id("actionPlan"),
      section: 9,
      sectionTitle: title,
      prompt: "What specific action or decision is required for this risk?",
      type: "textarea",
    },
    {
      id: id("actionOwner"),
      section: 9,
      sectionTitle: title,
      prompt: "Who owns that action or treatment decision?",
      type: "text",
    },
    {
      id: id("commitmentDate"),
      section: 9,
      sectionTitle: title,
      prompt: "What is the target commitment date?",
      type: "date",
      required: false,
      help: "A commitment date is expected for mitigation actions. You may skip it if it is genuinely not applicable.",
    },
    {
      id: id("evidenceLink"),
      section: 9,
      sectionTitle: title,
      prompt: "Add supporting evidence or a reference, if available.",
      type: "textarea",
      required: false,
      help: "Optional. You may enter a link, ticket number, file location, document name, approval reference, or a short note—or skip this question.",
    },
  ];
}

function moreRiskQuestion(index: number): DaxonQuestion {
  return {
    id: `risk.${index}.more`,
    section: 9,
    sectionTitle: `Risk Register Builder · Risk ${index + 1} complete`,
    prompt: "Do you have more risk to add?",
    type: "select",
    options: [
      { value: "Yes", label: "Yes" },
      { value: "No", label: "No" },
    ],
    help: "Tip: There are more risks than you think in every information that you hold.",
  };
}

export function buildDaxonQuestions(riskCount = 1) {
  const count = Math.max(1, Math.min(100, Math.floor(riskCount) || 1));
  return [
    ...discoveryQuestions,
    ...Array.from({ length: count }, (_, index) => [
      ...riskQuestions(index),
      moreRiskQuestion(index),
    ]).flat(),
    {
      id: "respondent.name",
      section: 9,
      sectionTitle: "Submission Details",
      prompt: "Who completed this guided ISRA?",
      type: "text" as const,
    },
    {
      id: "department",
      section: 9,
      sectionTitle: "Submission Details",
      prompt:
        "Finally, choose your department from the list, or type a new department or squad name. I’ll publish this assessment there.",
      type: "text" as const,
      help: "A new department name is added to ISRA SPOG, Daxon answers, and the Information Asset Inventory when you submit.",
    },
  ] satisfies DaxonQuestion[];
}

export function canonicalDepartmentName(
  value: string,
  catalog: Array<{ department: string; departmentKey?: string }>,
) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  const key = normalized.toLocaleLowerCase("en");
  const matched = catalog.find((item) => {
    const itemKey =
      item.departmentKey ||
      item.department.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
    return itemKey === key;
  });
  return matched?.department || normalized;
}

export function validateDaxonAnswer(
  question: DaxonQuestion,
  answer: string,
  allAnswers: Record<string, string> = {},
) {
  const value = answer.trim();
  if (question.type === "list") {
    const items = parseDaxonList(value).filter(Boolean);
    if (!items.length)
      return "Add at least one named item per row, or choose None.";
    if (items.some((item) => isNoneListAnswer(item))) {
      if (items.length > 1)
        return "Remove “None” if you are listing actual items.";
      return null;
    }
    if (items.length > 50) return "List no more than 50 items.";
    for (const item of items) {
      if (/[;\n•]/.test(item))
        return "Put each item on its own row instead of combining names.";
    }
    return null;
  }
  if (question.type === "list-followup") {
    const sourceItems = listedItemsFromAnswer(
      allAnswers[question.sourceQuestionId || ""] || "",
    );
    if (!sourceItems.length)
      return !value || isNoneListAnswer(value)
        ? null
        : "You listed no systems. Send None, or go back and add them first.";
    const rows = parseSystemOwners(value);
    for (const item of sourceItems) {
      const row = rows.find(
        (entry) => entry.item.toLocaleLowerCase("en") === item.toLocaleLowerCase("en"),
      );
      if (!row?.owner || isNoneListAnswer(row.owner))
        return `Add the owner for ${item}.`;
    }
    return null;
  }
  if (question.required !== false && !value)
    return "Please answer this question before continuing.";
  if (question.id === "department" && value.length > 200)
    return "Department name must be 200 characters or fewer.";
  if (
    /^risk\.\d+\.description$/.test(question.id) &&
    !/^Risk of\s+[\s\S]+?\s+Due to\s+[\s\S]+?\s+Resulting in\s+[\s\S]+$/.test(
      value,
    )
  )
    return "Use the required format exactly: “Risk of… Due to… Resulting in…”.";
  return null;
}

export function buildDaxonSubmission(
  answers: Record<string, string>,
  now = new Date(),
) {
  const department = answers.department.trim().replace(/\s+/g, " ");
  const dateId = now.toISOString().slice(0, 10).replaceAll("-", "");
  const findings: any[] = [];
  let riskCount = 1;
  while (answers[`risk.${riskCount - 1}.more`] === "Yes" && riskCount < 100)
    riskCount += 1;
  const risks = Array.from({ length: riskCount }, (_, index) => {
    const value = (field: string) =>
      answers[`risk.${index}.${field}`]?.trim() || null;
    const inherentLikelihood = Number(value("inherentLikelihood"));
    const inherentImpact = Number(value("inherentImpact"));
    const residualLikelihood = Number(value("residualLikelihood"));
    const residualImpact = Number(value("residualImpact"));
    const inherentScore = inherentLikelihood * inherentImpact;
    const residualScore = residualLikelihood * residualImpact;
    const commitmentDate = value("commitmentDate");
    const riskReference = `DX-${dateId}-${String(index + 1).padStart(2, "0")}`;
    if (!commitmentDate)
      findings.push({
        severity: "Low",
        rowNumber: index + 2,
        riskReference,
        category: "Missing commitment dates",
        message: "Commitment date was not provided in the guided assessment.",
      });
    return {
      rowNumber: index + 2,
      riskReference,
      process: value("process"),
      description: value("description"),
      inherentLikelihood,
      inherentImpact,
      inherentScore,
      importedInherentScore: inherentScore,
      existingControls: value("existingControls"),
      controlEffectiveness: Number(value("controlEffectiveness")) / 100,
      controlEffectivenessRemarks: value("controlRemarks"),
      residualLikelihood,
      residualImpact,
      residualScore,
      riskTreatment: value("treatment"),
      actionPlan: value("actionPlan"),
      actionOwner: value("actionOwner"),
      commitmentDate: commitmentDate
        ? new Date(`${commitmentDate}T00:00:00.000Z`).toISOString()
        : null,
      rawCommitmentDate: commitmentDate,
      evidenceLink: value("evidenceLink"),
      inherentRating: israRating(inherentScore),
      residualRating: israRating(residualScore),
      manualReview: !commitmentDate,
    };
  });
  return {
    department,
    sourceFile: `Daxon Guided ISRA — ${department}`,
    sourceSheet: "Guided Questionnaire",
    sourceType: "Daxon Questionnaire",
    respondentName: answers["respondent.name"].trim(),
    questionnaireResponses: answers,
    risks,
    findings,
  };
}
