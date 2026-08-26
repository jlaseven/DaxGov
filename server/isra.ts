import { z } from "zod";

const nullableText = z.string().trim().max(10_000).nullable();
const nullableNumber = z.number().finite().nullable();
const nullableDate = z
  .string()
  .datetime()
  .nullable()
  .transform((value) => (value ? new Date(value) : null));

export const israRiskSchema = z.object({
  rowNumber: z.number().int().positive(),
  riskReference: nullableText,
  process: nullableText,
  description: nullableText,
  inherentLikelihood: z.number().int().min(1).max(5).nullable(),
  inherentImpact: z.number().int().min(1).max(5).nullable(),
  inherentScore: nullableNumber,
  importedInherentScore: nullableNumber,
  existingControls: nullableText,
  controlEffectiveness: z.number().min(0).max(1).nullable(),
  controlEffectivenessRemarks: nullableText,
  residualLikelihood: z.number().int().min(1).max(5).nullable(),
  residualImpact: z.number().int().min(1).max(5).nullable(),
  residualScore: nullableNumber,
  riskTreatment: nullableText,
  actionPlan: nullableText,
  actionOwner: nullableText,
  commitmentDate: nullableDate,
  rawCommitmentDate: nullableText,
  evidenceLink: nullableText,
  inherentRating: z.enum(["Critical", "High", "Moderate", "Low", "Unrated"]),
  residualRating: z.enum(["Critical", "High", "Moderate", "Low", "Unrated"]),
  manualReview: z.boolean(),
});

export const israQualityFindingSchema = z.object({
  severity: z.enum(["High", "Medium", "Low"]),
  rowNumber: z.number().int().positive(),
  riskReference: nullableText,
  category: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(2_000),
});

const daxonRiskDescriptionPattern =
  /^Risk of\s+[\s\S]+?\s+Due to\s+[\s\S]+?\s+Resulting in\s+[\s\S]+$/;

export const israImportSchema = z
  .object({
    department: z.string().trim().min(1, "Department is required").max(200),
    sourceFile: z.string().trim().min(1).max(500),
    sourceSheet: z.string().trim().min(1).max(200),
    sourceType: z.enum(["Workbook", "Daxon Questionnaire"]).default("Workbook"),
    respondentName: z.string().trim().max(200).nullable().optional(),
    questionnaireResponses: z
      .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
      .optional(),
    risks: z.array(israRiskSchema).min(1).max(5_000),
    findings: z.array(israQualityFindingSchema).max(20_000),
  })
  .superRefine((assessment, context) => {
    if (assessment.sourceType !== "Daxon Questionnaire") return;

    assessment.risks.forEach((risk, index) => {
      const description = risk.description?.trim() ?? "";
      if (!daxonRiskDescriptionPattern.test(description))
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["risks", index, "description"],
          message:
            "Risk description must use: Risk of... Due to... Resulting in....",
        });
    });
  });

export function departmentKey(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function normalizeDepartmentName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export const departmentBodySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Department name is required")
      .max(200)
      .transform(normalizeDepartmentName),
  })
  .strip();

export function israRating(score: number | null | undefined) {
  if (score == null || !Number.isFinite(score) || score < 1) return "Unrated";
  if (score >= 20) return "Critical";
  if (score >= 12) return "High";
  if (score >= 6) return "Moderate";
  return "Low";
}

const optionalUpdateDate = z
  .union([z.string().date(), z.null()])
  .optional()
  .transform((value) =>
    value === undefined ? undefined : value ? new Date(`${value}T00:00:00`) : null,
  );

function localDateString(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: Date | string) {
  if (value instanceof Date) return value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00`);
  return new Date(value);
}

export const israRiskUpdateSchema = z.object({
  process: nullableText.optional(),
  description: nullableText.optional(),
  inherentLikelihood: z.number().int().min(1).max(5).nullable().optional(),
  inherentImpact: z.number().int().min(1).max(5).nullable().optional(),
  existingControls: nullableText.optional(),
  controlEffectiveness: z.number().min(0).max(1).nullable().optional(),
  controlEffectivenessRemarks: nullableText.optional(),
  residualLikelihood: z.number().int().min(1).max(5).nullable().optional(),
  residualImpact: z.number().int().min(1).max(5).nullable().optional(),
  riskTreatment: nullableText.optional(),
  actionPlan: nullableText.optional(),
  actionOwner: nullableText.optional(),
  commitmentDate: optionalUpdateDate,
  evidenceLink: nullableText.optional(),
});

type IsraScoreFields = {
  inherentLikelihood: number | null;
  inherentImpact: number | null;
  residualLikelihood: number | null;
  residualImpact: number | null;
};

export function applyIsraRiskUpdate(
  current: IsraScoreFields,
  patch: z.infer<typeof israRiskUpdateSchema>,
) {
  const inherentLikelihood =
    patch.inherentLikelihood !== undefined
      ? patch.inherentLikelihood
      : current.inherentLikelihood;
  const inherentImpact =
    patch.inherentImpact !== undefined
      ? patch.inherentImpact
      : current.inherentImpact;
  const residualLikelihood =
    patch.residualLikelihood !== undefined
      ? patch.residualLikelihood
      : current.residualLikelihood;
  const residualImpact =
    patch.residualImpact !== undefined
      ? patch.residualImpact
      : current.residualImpact;
  const inherentScore =
    inherentLikelihood && inherentImpact
      ? inherentLikelihood * inherentImpact
      : null;
  const residualScore =
    residualLikelihood && residualImpact
      ? residualLikelihood * residualImpact
      : null;
  const commitmentDate =
    patch.commitmentDate === undefined
      ? undefined
      : patch.commitmentDate
        ? parseLocalDate(patch.commitmentDate)
        : null;
  return {
    ...patch,
    inherentScore,
    inherentRating: israRating(inherentScore),
    residualScore,
    residualRating: israRating(residualScore),
    manualReview: true,
    ...(commitmentDate !== undefined
      ? {
          commitmentDate,
          rawCommitmentDate: commitmentDate
            ? localDateString(commitmentDate)
            : null,
        }
      : {}),
  };
}

export function israActionDueStatus(
  risk: { commitmentDate?: Date | string | null },
  now = new Date(),
) {
  if (!risk.commitmentDate) return "Missing";
  const due = new Date(risk.commitmentDate);
  const days = Math.ceil(
    (due.setHours(0, 0, 0, 0) -
      new Date(now).setHours(0, 0, 0, 0)) /
      86_400_000,
  );
  if (days < 0) return "Overdue";
  if (days <= 30) return "Due ≤30 days";
  return "Future";
}
