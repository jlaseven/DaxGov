import * as XLSX from "xlsx";

export type IsraFinding = {
  severity: "High" | "Medium" | "Low";
  rowNumber: number;
  riskReference: string | null;
  category: string;
  message: string;
};

const aliases: Record<string, string[]> = {
  riskReference: ["id", "risk id", "risk reference", "risk no"],
  process: ["process", "business process", "department process"],
  description: ["risk description", "description", "risk"],
  inherentLikelihood: [
    "inherent likelihood (1-5)",
    "inherent likelihood",
    "likelihood",
  ],
  inherentImpact: ["inherent impact (1-5)", "inherent impact", "impact"],
  importedInherentScore: ["inherent risk score", "inherent score"],
  existingControls: ["existing controls", "controls", "current controls"],
  controlEffectiveness: [
    "control effectiveness (0-100%)",
    "control effectiveness",
    "control effectiveness %",
  ],
  controlEffectivenessRemarks: [
    "control effectiveness remarks",
    "control remarks",
  ],
  residualLikelihood: ["residual likelihood", "residual likelihood (1-5)"],
  residualImpact: ["residual impact", "residual impact (1-5)"],
  residualScore: ["residual risk score", "residual score"],
  riskTreatment: ["risk treatment", "treatment", "treatment decision"],
  actionPlanOwner: [
    "action plan / owner",
    "action plan/owner",
    "action plan and owner",
    "action plan",
  ],
  actionOwner: ["action owner", "owner", "risk owner"],
  commitmentDate: ["commitment date", "due date", "target date"],
  evidenceLink: ["evidence link", "evidence url", "supporting evidence"],
};

const requiredFields = [
  "riskReference",
  "process",
  "description",
  "inherentLikelihood",
  "inherentImpact",
];

const clean = (value: unknown) =>
  [...String(value ?? "")]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 || code === 9 || code === 10 || code === 13;
    })
    .join("")
    .trim();

const normalize = (value: unknown) =>
  clean(value)
    .toLocaleLowerCase("en")
    .replace(/[\s_\-/()]+/g, " ")
    .replace(/[^a-z0-9% ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function headerMap(headers: unknown[]) {
  const normalized = headers.map(normalize);
  return Object.fromEntries(
    Object.entries(aliases).flatMap(([field, accepted]) => {
      const normalizedAliases = accepted.map(normalize);
      const index = normalized.findIndex((header) =>
        normalizedAliases.includes(header),
      );
      return index < 0 ? [] : [[field, index]];
    }),
  ) as Record<string, number>;
}

function numberValue(value: unknown) {
  if (value == null || clean(value) === "") return null;
  const number =
    typeof value === "number" ? value : Number(clean(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : null;
}

function percentageValue(value: unknown) {
  const number = numberValue(
    typeof value === "string" ? value.replace("%", "") : value,
  );
  if (number == null) return null;
  const normalized =
    clean(value).includes("%") || number > 1 ? number / 100 : number;
  return normalized >= 0 && normalized <= 1 ? normalized : null;
}

function dateValue(value: unknown) {
  if (value == null || clean(value) === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const text = clean(value);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const parsed = iso
    ? new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    : new Date(text);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.getFullYear() > 1990 &&
    parsed.getFullYear() < 2200
    ? parsed
    : null;
}

function splitAction(value: unknown) {
  const text = clean(value);
  if (!text) return { actionPlan: null, actionOwner: null };
  const patterns = [
    /^(.*?)\s*[|;]\s*(?:owner\s*[:-]?\s*)?([^|;]+)$/i,
    /^(.*?)\s*\/(?:\s*owner\s*[:-]?)?\s*([^/]+)$/i,
    /^(.*?)\s+[-–]\s+(?:owner\s*[:-]?\s*)?(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match)
      return {
        actionPlan: clean(match[1]) || null,
        actionOwner: clean(match[2]) || null,
      };
  }
  const ownerMatch = text.match(/^(.*?)\s+owner\s*[:-]\s*(.+)$/i);
  return ownerMatch
    ? {
        actionPlan: clean(ownerMatch[1]) || null,
        actionOwner: clean(ownerMatch[2]) || null,
      }
    : { actionPlan: text, actionOwner: null };
}

export function israRating(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score) || score < 1) return "Unrated";
  if (score >= 20) return "Critical";
  if (score >= 12) return "High";
  if (score >= 6) return "Moderate";
  return "Low";
}

export function parseIsraRows(
  rows: unknown[][],
  headers: unknown[],
  headerRow = 0,
  formulas: string[][] = [],
) {
  const map = headerMap(headers);
  const missing = requiredFields.filter((field) => map[field] == null);
  if (missing.length)
    throw new Error(
      `The ISRA format is missing required columns: ${missing
        .map((field) => aliases[field][0])
        .join(", ")}.`,
    );

  const findings: IsraFinding[] = [];
  const risks: any[] = [];
  const seen = new Map<string, number[]>();
  const addFinding = (
    severity: IsraFinding["severity"],
    rowNumber: number,
    riskReference: string | null,
    category: string,
    message: string,
  ) => findings.push({ severity, rowNumber, riskReference, category, message });

  rows.forEach((row, index) => {
    if (row.every((value) => clean(value) === "")) return;
    const rowNumber = headerRow + index + 2;
    const get = (field: string) =>
      map[field] == null ? null : row[map[field]];
    const riskReference = clean(get("riskReference")) || null;
    const process = clean(get("process")) || null;
    const description = clean(get("description")) || null;

    if (!riskReference)
      addFinding(
        "High",
        rowNumber,
        null,
        "Missing mandatory fields",
        "Risk ID is missing.",
      );
    if (!process)
      addFinding(
        "High",
        rowNumber,
        riskReference,
        "Missing mandatory fields",
        "Process is missing.",
      );
    if (!description)
      addFinding(
        "High",
        rowNumber,
        riskReference,
        "Missing mandatory fields",
        "Risk description is missing.",
      );

    const likelihoodRaw = numberValue(get("inherentLikelihood"));
    const impactRaw = numberValue(get("inherentImpact"));
    const inherentLikelihood =
      Number.isInteger(likelihoodRaw) &&
      likelihoodRaw! >= 1 &&
      likelihoodRaw! <= 5
        ? likelihoodRaw
        : null;
    const inherentImpact =
      Number.isInteger(impactRaw) && impactRaw! >= 1 && impactRaw! <= 5
        ? impactRaw
        : null;
    if (inherentLikelihood == null)
      addFinding(
        "High",
        rowNumber,
        riskReference,
        "Invalid likelihood or impact values",
        `Likelihood must be an integer from 1 to 5; found “${clean(get("inherentLikelihood")) || "blank"}”.`,
      );
    if (inherentImpact == null)
      addFinding(
        "High",
        rowNumber,
        riskReference,
        "Invalid likelihood or impact values",
        `Impact must be an integer from 1 to 5; found “${clean(get("inherentImpact")) || "blank"}”.`,
      );

    const inherentScore =
      inherentLikelihood != null && inherentImpact != null
        ? inherentLikelihood * inherentImpact
        : null;
    const importedInherentScore = numberValue(get("importedInherentScore"));
    if (
      importedInherentScore != null &&
      inherentScore != null &&
      Math.abs(importedInherentScore - inherentScore) > 0.01
    )
      addFinding(
        "Medium",
        rowNumber,
        riskReference,
        "Score mismatch",
        `Imported inherent score ${importedInherentScore} differs from recalculated score ${inherentScore}.`,
      );

    const effectivenessRaw = get("controlEffectiveness");
    const controlEffectiveness = percentageValue(effectivenessRaw);
    if (clean(effectivenessRaw) && controlEffectiveness == null)
      addFinding(
        "Medium",
        rowNumber,
        riskReference,
        "Invalid percentages",
        `Control effectiveness must be 0–100%; found “${clean(effectivenessRaw)}”.`,
      );

    const residualLikelihoodRaw = numberValue(get("residualLikelihood"));
    const residualImpactRaw = numberValue(get("residualImpact"));
    const residualLikelihood =
      Number.isInteger(residualLikelihoodRaw) &&
      residualLikelihoodRaw! >= 1 &&
      residualLikelihoodRaw! <= 5
        ? residualLikelihoodRaw
        : null;
    const residualImpact =
      Number.isInteger(residualImpactRaw) &&
      residualImpactRaw! >= 1 &&
      residualImpactRaw! <= 5
        ? residualImpactRaw
        : null;
    if (clean(get("residualLikelihood")) && residualLikelihood == null)
      addFinding(
        "Medium",
        rowNumber,
        riskReference,
        "Invalid likelihood or impact values",
        "Residual likelihood must be an integer from 1 to 5.",
      );
    if (clean(get("residualImpact")) && residualImpact == null)
      addFinding(
        "Medium",
        rowNumber,
        riskReference,
        "Invalid likelihood or impact values",
        "Residual impact must be an integer from 1 to 5.",
      );
    const calculatedResidualScore =
      residualLikelihood != null && residualImpact != null
        ? residualLikelihood * residualImpact
        : null;
    const importedResidualScore = numberValue(get("residualScore"));
    const residualScore = calculatedResidualScore ?? importedResidualScore;
    if (residualScore != null && (residualScore < 0 || residualScore > 25))
      addFinding(
        "High",
        rowNumber,
        riskReference,
        "Invalid residual score",
        `Residual score must be between 0 and 25; found ${residualScore}.`,
      );
    if (
      calculatedResidualScore != null &&
      importedResidualScore != null &&
      Math.abs(calculatedResidualScore - importedResidualScore) > 0.01
    )
      addFinding(
        "Medium",
        rowNumber,
        riskReference,
        "Score mismatch",
        `Imported residual score ${importedResidualScore} differs from recalculated score ${calculatedResidualScore}.`,
      );

    const commitmentRaw = get("commitmentDate");
    const commitmentDate = dateValue(commitmentRaw);
    if (clean(commitmentRaw) && !commitmentDate)
      addFinding(
        "Medium",
        rowNumber,
        riskReference,
        "Invalid dates",
        `Commitment date is not valid: “${clean(commitmentRaw)}”.`,
      );
    const action = splitAction(get("actionPlanOwner"));
    const explicitOwner = clean(get("actionOwner")) || null;
    const actionOwner = explicitOwner || action.actionOwner;
    const riskTreatment = clean(get("riskTreatment")) || null;
    if (!actionOwner)
      addFinding(
        "Medium",
        rowNumber,
        riskReference,
        "Missing owners",
        "No action owner could be identified.",
      );
    if (!action.actionPlan)
      addFinding(
        "Medium",
        rowNumber,
        riskReference,
        "Missing action plans",
        "Action plan is blank.",
      );
    if (!riskTreatment)
      addFinding(
        "Medium",
        rowNumber,
        riskReference,
        "Missing treatment decisions",
        "Risk treatment is blank.",
      );
    if (!commitmentDate)
      addFinding(
        "Low",
        rowNumber,
        riskReference,
        "Missing commitment dates",
        "Commitment date is blank or invalid.",
      );
    formulas[index]?.forEach((formula) => {
      if (
        /^#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)/i.test(clean(formula))
      )
        addFinding(
          "High",
          rowNumber,
          riskReference,
          "Formula errors",
          `Formula error ${clean(formula)} was found.`,
        );
    });

    const risk = {
      rowNumber,
      riskReference,
      process,
      description,
      inherentLikelihood,
      inherentImpact,
      inherentScore,
      importedInherentScore,
      existingControls: clean(get("existingControls")) || null,
      controlEffectiveness,
      controlEffectivenessRemarks:
        clean(get("controlEffectivenessRemarks")) || null,
      residualLikelihood,
      residualImpact,
      residualScore:
        residualScore != null && residualScore >= 0 && residualScore <= 25
          ? residualScore
          : null,
      riskTreatment,
      actionPlan: action.actionPlan,
      actionOwner,
      commitmentDate: commitmentDate?.toISOString() || null,
      rawCommitmentDate: clean(commitmentRaw) || null,
      evidenceLink: clean(get("evidenceLink")) || null,
      inherentRating: israRating(inherentScore),
      residualRating: israRating(residualScore),
      manualReview: false,
    };
    risks.push(risk);
    if (riskReference)
      seen.set(riskReference, [...(seen.get(riskReference) || []), rowNumber]);
  });

  seen.forEach((rowNumbers, riskReference) => {
    if (rowNumbers.length > 1)
      rowNumbers.forEach((rowNumber) =>
        addFinding(
          "High",
          rowNumber,
          riskReference,
          "Duplicate risk IDs",
          `Risk ID “${riskReference}” appears ${rowNumbers.length} times.`,
        ),
      );
  });
  risks.forEach((risk) => {
    risk.manualReview = findings.some(
      (finding) =>
        finding.rowNumber === risk.rowNumber && finding.severity !== "Low",
    );
  });
  return { risks, findings };
}

export const MAX_ISRA_WORKBOOK_BYTES = 8 * 1024 * 1024;

export function parseIsraWorkbookBuffer(
  contents: ArrayBuffer | Uint8Array,
  fileName: string,
) {
  if (!fileName.toLocaleLowerCase("en").endsWith(".xlsx"))
    throw new Error("Select an .xlsx ISRA workbook.");
  const bytes =
    contents instanceof ArrayBuffer
      ? new Uint8Array(contents)
      : contents;
  if (!bytes.byteLength) throw new Error("The selected workbook is empty.");
  if (bytes.byteLength > MAX_ISRA_WORKBOOK_BYTES)
    throw new Error("The workbook is larger than the 8 MB limit.");

  const workbook = XLSX.read(bytes, {
    type: "array",
    cellDates: true,
    cellFormula: false,
    cellNF: true,
  });
  let best:
    | {
        sheetName: string;
        worksheet: XLSX.WorkSheet;
        rows: unknown[][];
        headerRow: number;
        score: number;
      }
    | undefined;
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: "",
      blankrows: true,
    });
    rows.slice(0, 20).forEach((row, headerRow) => {
      const map = headerMap(row);
      const score = requiredFields.filter((field) => map[field] != null).length;
      const nameBonus = ["isra", "risk register"].includes(normalize(sheetName))
        ? 0.5
        : 0;
      if (!best || score + nameBonus > best.score)
        best = {
          sheetName,
          worksheet,
          rows,
          headerRow,
          score: score + nameBonus,
        };
    });
  }
  if (!best || best.score < requiredFields.length)
    throw new Error(
      "No compatible ISRA risk register was found. The workbook needs Risk ID, Process, Risk Description, Inherent Likelihood, and Inherent Impact columns.",
    );
  const headers = best.rows[best.headerRow];
  const dataRows = best.rows.slice(best.headerRow + 1);
  const formulas = dataRows.map((_, rowOffset) =>
    headers.map((__, column) => {
      const cell =
        best!.worksheet[
          XLSX.utils.encode_cell({
            r: best!.headerRow + rowOffset + 1,
            c: column,
          })
        ];
      return cell?.f ? `=${cell.f}` : clean(cell?.v);
    }),
  );
  const parsed = parseIsraRows(dataRows, headers, best.headerRow, formulas);
  if (!parsed.risks.length)
    throw new Error(
      "No populated risk records were found in the ISRA register.",
    );
  return { ...parsed, sourceSheet: best.sheetName };
}

export async function parseIsraWorkbook(file: File) {
  return parseIsraWorkbookBuffer(await file.arrayBuffer(), file.name);
}
