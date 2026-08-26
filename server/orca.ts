import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

const opt = z.string().trim().max(20000).nullish();
const date = z
  .string()
  .date()
  .nullish()
  .transform((value) => (value ? new Date(value) : null));

export function ratingDigit(value?: string | null) {
  const match = String(value || "")
    .trim()
    .match(/^(\d)/);
  return match ? Number(match[1]) : null;
}

export function computeOrcaScores(data: {
  inherentLikelihood?: string | null;
  inherentImpactRating?: string | null;
  residualLikelihoodRating?: string | null;
  residualImpactRating?: string | null;
}) {
  const inherentL = ratingDigit(data.inherentLikelihood);
  const inherentI = ratingDigit(data.inherentImpactRating);
  const residualL = ratingDigit(data.residualLikelihoodRating);
  const residualI = ratingDigit(data.residualImpactRating);
  return {
    inherentRiskScore:
      inherentL != null && inherentI != null ? inherentL * inherentI : null,
    residualRiskScore:
      residualL != null && residualI != null ? residualL * residualI : null,
    residualLikelihood: residualL,
    residualImpact: residualI,
  };
}

const orcaBody = z.object({
  sortOrder: z.number().int().optional(),
  processNo: z.string().trim().min(1).max(40),
  process: z.string().trim().min(1).max(200),
  riskNo: z.string().trim().min(1).max(40),
  riskCategory: opt,
  riskThreat: z.string().trim().min(1),
  cause: opt,
  inherentLikelihood: opt,
  riskStrategy: opt,
  existingKeyControls: opt,
  controlEffectivity: opt,
  overallControlEffectivenessRemarks: opt,
  impactCategory: opt,
  impactPerRisk: opt,
  inherentImpactRating: opt,
  inherentRiskScore: z.number().int().nullish(),
  inherentRiskRatingRemarks: opt,
  residualLikelihoodRating: opt,
  residualImpactRating: opt,
  residualRiskScore: z.number().int().nullish(),
  residualRiskRemarks: opt,
  riskManagementRemarks: opt,
  actionItemRequired: opt,
  riskAcceptanceRequired: opt,
  riskAcceptanceFormLink: opt,
  actionItems: opt,
  targetCompletionDate: date,
  status: opt,
  residualLikelihood: z.number().int().nullish(),
  residualImpact: z.number().int().nullish(),
});

export const orcaSchema = orcaBody;

type SeedRow = {
  sortOrder: number;
  processNo: string;
  process: string;
  riskNo: string;
  riskCategory: string;
  riskThreat: string;
  cause: string;
  inherentLikelihood: string;
  riskStrategy: string;
  existingKeyControls: string;
  controlEffectivity: string;
  overallControlEffectivenessRemarks: string;
  impactCategory: string;
  impactPerRisk: string;
  inherentImpactRating: string;
  inherentRiskScore: number | null;
  inherentRiskRatingRemarks: string;
  residualLikelihoodRating: string;
  residualImpactRating: string;
  residualRiskScore: number | null;
  residualRiskRemarks: string;
  riskManagementRemarks: string;
  actionItemRequired: string;
  riskAcceptanceRequired: string;
  riskAcceptanceFormLink: string;
  actionItems: string;
  targetCompletionDate: string | null;
  status: string;
  residualLikelihood: number | null;
  residualImpact: number | null;
};

function blankToNull(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function loadOrcaSeedRows(): SeedRow[] {
  const seedPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "orcaAssessmentSeed.json",
  );
  return JSON.parse(readFileSync(seedPath, "utf8")) as SeedRow[];
}

export async function ensureOrcaSeed(prisma: PrismaClient) {
  const existing = await prisma.orcaRisk.count();
  if (existing > 0) return existing;
  const rows = loadOrcaSeedRows();
  await prisma.orcaRisk.createMany({
    data: rows.map((row) => ({
      sortOrder: row.sortOrder,
      processNo: row.processNo,
      process: row.process,
      riskNo: row.riskNo,
      riskCategory: blankToNull(row.riskCategory),
      riskThreat: row.riskThreat,
      cause: blankToNull(row.cause),
      inherentLikelihood: blankToNull(row.inherentLikelihood),
      riskStrategy: blankToNull(row.riskStrategy),
      existingKeyControls: blankToNull(row.existingKeyControls),
      controlEffectivity: blankToNull(row.controlEffectivity),
      overallControlEffectivenessRemarks: blankToNull(
        row.overallControlEffectivenessRemarks,
      ),
      impactCategory: blankToNull(row.impactCategory),
      impactPerRisk: blankToNull(row.impactPerRisk),
      inherentImpactRating: blankToNull(row.inherentImpactRating),
      inherentRiskScore: row.inherentRiskScore,
      inherentRiskRatingRemarks: blankToNull(row.inherentRiskRatingRemarks),
      residualLikelihoodRating: blankToNull(row.residualLikelihoodRating),
      residualImpactRating: blankToNull(row.residualImpactRating),
      residualRiskScore: row.residualRiskScore,
      residualRiskRemarks: blankToNull(row.residualRiskRemarks),
      riskManagementRemarks: blankToNull(row.riskManagementRemarks),
      actionItemRequired: blankToNull(row.actionItemRequired),
      riskAcceptanceRequired: blankToNull(row.riskAcceptanceRequired),
      riskAcceptanceFormLink: blankToNull(row.riskAcceptanceFormLink),
      actionItems: blankToNull(row.actionItems),
      targetCompletionDate: row.targetCompletionDate
        ? new Date(row.targetCompletionDate)
        : null,
      status: blankToNull(row.status),
      residualLikelihood: row.residualLikelihood,
      residualImpact: row.residualImpact,
    })),
  });
  return rows.length;
}
