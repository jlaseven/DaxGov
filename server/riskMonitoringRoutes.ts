import type { PrismaClient } from "@prisma/client";
import type { Express } from "express";
import { z } from "zod";
import { currentUser, FORBIDDEN, userHasPage, type AuthUser } from "./auth.js";
import type { LogFn } from "./activityLog.js";
import { computeOrcaScores } from "./orca.js";
import {
  MONITORING_FREQUENCIES,
  THRESHOLD_MODES,
  KRI_FREQUENCIES,
  KRI_UNITS,
  REVIEW_DECISIONS,
  calculateMonitoringEffectiveness,
  coveragePercent,
  evaluateKriResult,
  getCurrentKriPeriod,
  getKriSubmissionStatus,
  getOrcaMonitoringStatus,
  managementAttention,
  monthRemarksField,
  monthResultField,
  previousMonthlyPeriod,
  residualBand,
  validateThreshold,
  type MappedKriInput,
  type MonitoringStatus,
  type ThresholdConfig,
} from "./riskMonitoring.js";

const opt = z.string().trim().max(20000).nullish();

const profileSchema = z
  .object({
    kriMonitoringRequired: z.boolean().nullable(),
    monitoringRationale: opt,
    monitoringFrequency: z
      .enum(MONITORING_FREQUENCIES)
      .nullable()
      .optional(),
    monitoringOwner: opt,
    nextMonitoringReviewDate: z
      .string()
      .date()
      .nullish()
      .transform((value) => (value ? new Date(value) : null)),
  })
  .strip();

const thresholdSchema = z
  .object({
    mode: z.enum(THRESHOLD_MODES),
    goodMin: z.number().finite().nullish(),
    goodMax: z.number().finite().nullish(),
    warningMin: z.number().finite().nullish(),
    warningMax: z.number().finite().nullish(),
    breachMin: z.number().finite().nullish(),
    breachMax: z.number().finite().nullish(),
  })
  .strip();

const submissionSchema = z
  .object({
    year: z.number().int().min(2000).max(2100),
    month: z.number().int().min(1).max(12),
    actualValue: z.number().finite().nullish(),
    status: z.enum(["Good", "Warning", "Breached"]).nullish(),
    remarks: opt,
    evidenceLink: opt,
  })
  .strip();

const reviewSchema = z
  .object({
    decision: z.enum(REVIEW_DECISIONS),
    rationale: z.string().trim().min(1).max(20000),
    newLikelihood: opt,
    newImpact: opt,
  })
  .strip();

const createKriSchema = z
  .object({
    orcaRiskIds: z.array(z.number().int()).min(1).max(200),
    year: z.number().int().min(2000).max(2100).optional(),
    riskName: z.string().trim().min(1).max(400),
    kriNumber: z.string().trim().min(1).max(40),
    keyRiskIndicator: z.string().trim().min(1),
    owner: opt,
    frequency: z.enum(KRI_FREQUENCIES).optional(),
    dataSource: opt,
    unit: z.enum(KRI_UNITS).optional(),
    direction: z.enum(["HIGHER_IS_BETTER", "LOWER_IS_BETTER"]).optional(),
    weight: z.number().min(0).max(1).nullish(),
    threshold: thresholdSchema,
  })
  .strip();

function canView(user: AuthUser) {
  return (
    user.role === "Admin" ||
    userHasPage(user, "kris") ||
    userHasPage(user, "orca")
  );
}

function canEditOrca(user: AuthUser) {
  return user.role === "Admin" || userHasPage(user, "orca");
}

function canEditKri(user: AuthUser) {
  return user.role === "Admin" || userHasPage(user, "kris");
}

function deny(res: any, user: AuthUser | undefined, allowed: boolean) {
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return true;
  }
  if (!allowed) {
    res.status(403).json({ error: FORBIDDEN });
    return true;
  }
  return false;
}

function mappedInput(kri: {
  archivedAt: Date | null;
  owner: string | null;
  frequency: string | null;
  threshold: { mode: string } | null;
  good: string | null;
  warning: string | null;
  breached: string | null;
}): MappedKriInput {
  return {
    archivedAt: kri.archivedAt,
    owner: kri.owner,
    frequency: kri.frequency,
    hasStructuredThreshold: Boolean(kri.threshold),
    thresholdMode: kri.threshold?.mode,
    good: kri.good,
    warning: kri.warning,
    breached: kri.breached,
  };
}

function latestStatus(
  submissions: { year: number; month: number; status: string | null }[],
  record: Record<string, unknown>,
) {
  const fromSub = [...submissions].sort(
    (a, b) => b.year * 12 + b.month - (a.year * 12 + a.month),
  )[0];
  if (fromSub?.status) return fromSub.status;
  const keys = [
    "dec",
    "nov",
    "oct",
    "sep",
    "aug",
    "jul",
    "jun",
    "may",
    "apr",
    "mar",
    "feb",
    "jan",
  ];
  for (const key of keys) {
    const value = record[`${key}Result`];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

export function registerRiskMonitoringRoutes(
  app: Express,
  prisma: PrismaClient,
  log: LogFn,
) {
  app.get("/api/risk-monitoring/coverage", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canView(user)))) return;
      const search = String(req.query.search || "").trim();
      const required = String(req.query.required || "");
      const coverage = String(req.query.coverage || "");
      const latest = String(req.query.latest || "");
      const payload = await loadCoverage(prisma);
      const rows = payload.rows.filter((row) => {
        if (required === "yes" && row.kriMonitoringRequired !== true) return false;
        if (required === "no" && row.kriMonitoringRequired !== false) return false;
        if (required === "unassessed" && row.kriMonitoringRequired != null)
          return false;
        if (coverage && row.monitoringStatus !== coverage) return false;
        if (latest && row.latestKriStatus !== latest) return false;
        if (search) {
          const hay = `${row.riskNo} ${row.process} ${row.riskThreat}`.toLowerCase();
          if (!hay.includes(search.toLowerCase())) return false;
        }
        return true;
      });
      res.json({
        data: rows,
        meta: payload.summary,
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/risk-monitoring/dashboard", async (_req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canView(user)))) return;
      res.json({ data: await loadDashboard(prisma) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/risk-monitoring/profiles/:orcaRiskId", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canEditOrca(user)))) return;
      const orcaRiskId = Number(req.params.orcaRiskId);
      const orca = await prisma.orcaRisk.findUnique({ where: { id: orcaRiskId } });
      if (!orca) return res.status(404).json({ error: "ORCA risk not found" });
      const data = profileSchema.parse(req.body);
      if (data.kriMonitoringRequired === false && !String(data.monitoringRationale || "").trim()) {
        return res.status(400).json({
          error: "Monitoring rationale is required when KRI monitoring is not required.",
        });
      }
      const row = await prisma.orcaMonitoringProfile.upsert({
        where: { orcaRiskId },
        create: { orcaRiskId, ...data },
        update: data,
      });
      await log("orca-monitoring", orcaRiskId, "Monitoring Requirement Changed", null, data, {
        targetName: orca.riskNo,
      });
      res.json({ data: row });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/kri-records/:id/threshold", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canView(user)))) return;
      const id = Number(req.params.id);
      const threshold = await prisma.kriThreshold.findUnique({
        where: { kriRecordId: id },
      });
      res.json({
        data: threshold || { kriRecordId: id, mode: "MANUAL" },
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/kri-records/:id/threshold", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canEditKri(user)))) return;
      const id = Number(req.params.id);
      const kri = await prisma.kriRecord.findUnique({ where: { id } });
      if (!kri) return res.status(404).json({ error: "KRI not found" });
      const data = thresholdSchema.parse(req.body);
      validateThreshold(data);
      const row = await prisma.kriThreshold.upsert({
        where: { kriRecordId: id },
        create: { kriRecordId: id, ...data },
        update: data,
      });
      await log("kri-records", id, "KRI Thresholds Changed", null, data);
      res.json({ data: row });
    } catch (error) {
      if (error instanceof Error && /threshold|overlap|band/i.test(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  app.get("/api/kri-records/:id/submissions", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canView(user)))) return;
      const id = Number(req.params.id);
      const rows = await prisma.kriSubmission.findMany({
        where: { kriRecordId: id },
        orderBy: [{ year: "desc" }, { month: "desc" }],
      });
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kri-records/:id/submissions", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canEditKri(user)))) return;
      const id = Number(req.params.id);
      const kri = await prisma.kriRecord.findUnique({
        where: { id },
        include: {
          sheet: true,
          threshold: true,
          mappings: { include: { orcaRisk: true } },
        },
      });
      if (!kri) return res.status(404).json({ error: "KRI not found" });
      if (kri.archivedAt) {
        return res.status(400).json({ error: "Cannot submit results for an archived KRI." });
      }
      const data = submissionSchema.parse(req.body);
      if (kri.sheet.year !== data.year) {
        return res.status(400).json({ error: "Submission year must match the KRI sheet year." });
      }
      const mode = kri.threshold?.mode || "MANUAL";
      let status = data.status || null;
      if (mode !== "MANUAL") {
        if (data.actualValue == null) {
          return res.status(400).json({ error: "Actual result is required." });
        }
        try {
          status = evaluateKriResult(kri.threshold as ThresholdConfig, data.actualValue);
        } catch (error) {
          return res.status(400).json({
            error: error instanceof Error ? error.message : "Unable to evaluate result",
          });
        }
      } else {
        if (!status) {
          return res.status(400).json({ error: "Status is required for manual KRIs." });
        }
        if (!String(data.remarks || "").trim()) {
          return res.status(400).json({ error: "Remarks are required for manual KRI status." });
        }
      }
      const resultField = monthResultField(data.month);
      const remarksField = monthRemarksField(data.month);
      const submittedAt = new Date();
      const submission = await prisma.$transaction(async (tx) => {
        const saved = await tx.kriSubmission.upsert({
          where: {
            kriRecordId_year_month: {
              kriRecordId: id,
              year: data.year,
              month: data.month,
            },
          },
          create: {
            kriRecordId: id,
            year: data.year,
            month: data.month,
            actualValue: data.actualValue ?? null,
            status,
            remarks: data.remarks ?? null,
            evidenceLink: data.evidenceLink ?? null,
            submittedBy: user!.displayName,
            submittedAt,
          },
          update: {
            actualValue: data.actualValue ?? null,
            status,
            remarks: data.remarks ?? null,
            evidenceLink: data.evidenceLink ?? null,
            submittedBy: user!.displayName,
            submittedAt,
          },
        });
        if (resultField) {
          await tx.kriRecord.update({
            where: { id },
            data: {
              [resultField]: status,
              ...(remarksField ? { [remarksField]: data.remarks ?? null } : {}),
            },
          });
        }
        if (status === "Breached") {
          await createRiskReviewsForKriBreach(tx, {
            kri,
            submission: saved,
            year: data.year,
            month: data.month,
            actualValue: data.actualValue ?? null,
          });
        }
        return saved;
      });
      await log("kri-records", id, "KRI Submission Added", null, {
        year: data.year,
        month: data.month,
        actualValue: data.actualValue,
        status,
      });
      if (status === "Breached") {
        await log("kri-records", id, "KRI Breach Triggered", null, {
          year: data.year,
          month: data.month,
        });
      }
      res.status(201).json({
        data: {
          ...submission,
          actualValue: submission.actualValue,
          status,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/risk-monitoring/kris", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canEditKri(user)))) return;
      const data = createKriSchema.parse(req.body);
      validateThreshold(data.threshold);
      const sheet = data.year
        ? await prisma.kriSheet.findUnique({ where: { year: data.year } })
        : await prisma.kriSheet.findFirst({
            where: { status: "Active" },
            orderBy: { year: "desc" },
          });
      if (!sheet) return res.status(400).json({ error: "No active KRI sheet." });
      const orcaRows = await prisma.orcaRisk.findMany({
        where: { id: { in: data.orcaRiskIds }, archivedAt: null },
      });
      if (orcaRows.length !== data.orcaRiskIds.length) {
        return res.status(400).json({ error: "One or more ORCA risks were not found." });
      }
      const maxSort = await prisma.kriRecord.aggregate({
        where: { sheetId: sheet.id },
        _max: { sortOrder: true },
      });
      const created = await prisma.$transaction(async (tx) => {
        const kri = await tx.kriRecord.create({
          data: {
            sheetId: sheet.id,
            sortOrder: (maxSort._max.sortOrder || 0) + 1,
            riskName: data.riskName,
            kriNumber: data.kriNumber,
            keyRiskIndicator: data.keyRiskIndicator,
            owner: data.owner ?? null,
            frequency: data.frequency || "MONTHLY",
            dataSource: data.dataSource ?? null,
            unit: data.unit ?? null,
            direction: data.direction ?? null,
            weight: data.weight ?? null,
            good:
              data.threshold.mode === "MANUAL"
                ? null
                : formatBand(data.threshold.goodMin, data.threshold.goodMax),
            warning:
              data.threshold.mode === "MANUAL"
                ? null
                : formatBand(data.threshold.warningMin, data.threshold.warningMax),
            breached:
              data.threshold.mode === "MANUAL"
                ? null
                : formatBand(data.threshold.breachMin, data.threshold.breachMax),
          },
        });
        await tx.kriThreshold.create({
          data: { kriRecordId: kri.id, ...data.threshold },
        });
        await tx.kriOrcaMap.createMany({
          data: data.orcaRiskIds.map((orcaRiskId) => ({
            kriRecordId: kri.id,
            orcaRiskId,
          })),
        });
        return kri;
      });
      await log("kri-records", created.id, "Created", null, {
        mappedOrca: data.orcaRiskIds,
      });
      res.status(201).json({ data: created });
    } catch (error) {
      if (error instanceof Error && /threshold|overlap|band/i.test(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  app.get("/api/orca-risk-reviews", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canView(user)))) return;
      const status = String(req.query.status || "OPEN");
      const orcaRiskId = Number(req.query.orcaRiskId) || undefined;
      const rows = await prisma.orcaRiskReview.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(orcaRiskId ? { orcaRiskId } : {}),
        },
        include: {
          orcaRisk: {
            select: {
              riskNo: true,
              process: true,
              riskThreat: true,
              residualLikelihoodRating: true,
              residualImpactRating: true,
              residualRiskScore: true,
            },
          },
          kriRecord: {
            select: { kriNumber: true, keyRiskIndicator: true },
          },
          kriSubmission: true,
        },
        orderBy: { createdAt: "desc" },
      });
      res.json({ data: rows });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/orca-risk-reviews/:id", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (deny(res, user, Boolean(user && canEditOrca(user)))) return;
      const id = Number(req.params.id);
      const review = await prisma.orcaRiskReview.findUnique({
        where: { id },
        include: { orcaRisk: true },
      });
      if (!review) return res.status(404).json({ error: "Risk review not found" });
      if (review.status !== "OPEN") {
        return res.status(400).json({ error: "This risk review is already closed." });
      }
      const data = reviewSchema.parse(req.body);
      const ratingChange =
        data.decision === "UPDATE_LIKELIHOOD" ||
        data.decision === "UPDATE_IMPACT" ||
        data.decision === "UPDATE_RISK_RATING";
      let newLikelihood = review.orcaRisk.residualLikelihoodRating;
      let newImpact = review.orcaRisk.residualImpactRating;
      if (ratingChange) {
        if (data.decision === "UPDATE_LIKELIHOOD" || data.decision === "UPDATE_RISK_RATING") {
          if (!data.newLikelihood) {
            return res.status(400).json({ error: "New residual likelihood is required." });
          }
          newLikelihood = data.newLikelihood;
        }
        if (data.decision === "UPDATE_IMPACT" || data.decision === "UPDATE_RISK_RATING") {
          if (!data.newImpact) {
            return res.status(400).json({ error: "New residual impact is required." });
          }
          newImpact = data.newImpact;
        }
      }
      const scores = computeOrcaScores({
        residualLikelihoodRating: newLikelihood,
        residualImpactRating: newImpact,
      });
      const completed = await prisma.$transaction(async (tx) => {
        if (ratingChange) {
          await tx.orcaRisk.update({
            where: { id: review.orcaRiskId },
            data: {
              residualLikelihoodRating: newLikelihood,
              residualImpactRating: newImpact,
              ...scores,
            },
          });
        }
        if (data.decision === "CREATE_ACTION") {
          const existing = review.orcaRisk.actionItems || "";
          const note = `Risk review #${id}: ${data.rationale}`;
          await tx.orcaRisk.update({
            where: { id: review.orcaRiskId },
            data: {
              actionItemRequired: "Y",
              actionItems: existing ? `${existing}\n${note}` : note,
            },
          });
        }
        return tx.orcaRiskReview.update({
          where: { id },
          data: {
            status: "COMPLETED",
            decision: data.decision,
            rationale: data.rationale,
            newLikelihood,
            newImpact,
            newResidualScore: scores.residualRiskScore,
            reviewedBy: user!.displayName,
            reviewedAt: new Date(),
          },
        });
      });
      await log("orca-risk-reviews", id, "ORCA Review Completed", null, data, {
        targetName: review.orcaRisk.riskNo,
      });
      if (ratingChange) {
        await log("orca", review.orcaRiskId, "Residual Risk Changed After Review", null, {
          newLikelihood,
          newImpact,
        });
      }
      res.json({ data: completed });
    } catch (error) {
      next(error);
    }
  });
}

function formatBand(min?: number | null, max?: number | null) {
  if (min == null && max == null) return null;
  if (min != null && max == null) return `>= ${min}`;
  if (min == null && max != null) return `<= ${max}`;
  if (min === max) return String(min);
  return `${min}–${max}`;
}

async function createRiskReviewsForKriBreach(
  tx: PrismaClient | any,
  input: {
    kri: {
      id: number;
      kriNumber: string;
      keyRiskIndicator: string;
      mappings: { orcaRisk: { id: number; archivedAt: Date | null } }[];
    };
    submission: { id: number };
    year: number;
    month: number;
    actualValue: number | null;
  },
) {
  const active = input.kri.mappings.filter((item) => !item.orcaRisk.archivedAt);
  for (const mapping of active) {
    const existing = await tx.orcaRiskReview.findFirst({
      where: {
        orcaRiskId: mapping.orcaRisk.id,
        kriRecordId: input.kri.id,
        year: input.year,
        month: input.month,
        triggerType: "KRI_BREACH",
        status: "OPEN",
      },
    });
    if (existing) continue;
    const orca = await tx.orcaRisk.findUnique({
      where: { id: mapping.orcaRisk.id },
    });
    await tx.orcaRiskReview.create({
      data: {
        orcaRiskId: mapping.orcaRisk.id,
        kriRecordId: input.kri.id,
        kriSubmissionId: input.submission.id,
        year: input.year,
        month: input.month,
        triggerType: "KRI_BREACH",
        triggerDetails: `${input.kri.kriNumber} ${input.kri.keyRiskIndicator} breached for ${input.year}-${String(input.month).padStart(2, "0")}${input.actualValue != null ? ` (actual ${input.actualValue})` : ""}`,
        status: "OPEN",
        oldLikelihood: orca?.residualLikelihoodRating,
        oldImpact: orca?.residualImpactRating,
        oldResidualScore: orca?.residualRiskScore,
      },
    });
  }
}

async function loadCoverage(prisma: PrismaClient) {
  const [risks, kris, reviews] = await Promise.all([
    prisma.orcaRisk.findMany({
      where: { archivedAt: null },
      include: { monitoringProfile: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.kriRecord.findMany({
      where: { sheet: { status: "Active" } },
      include: {
        threshold: true,
        mappings: true,
        submissions: true,
      },
    }),
    prisma.orcaRiskReview.findMany({
      where: { status: "OPEN" },
    }),
  ]);
  const krisByOrca = new Map<number, typeof kris>();
  for (const kri of kris) {
    for (const mapping of kri.mappings) {
      const list = krisByOrca.get(mapping.orcaRiskId) || [];
      list.push(kri);
      krisByOrca.set(mapping.orcaRiskId, list);
    }
  }
  const reviewsByOrca = new Map<number, typeof reviews>();
  for (const review of reviews) {
    const list = reviewsByOrca.get(review.orcaRiskId) || [];
    list.push(review);
    reviewsByOrca.set(review.orcaRiskId, list);
  }
  const now = new Date();
  const current = getCurrentKriPeriod(now);
  const rows = risks.map((risk) => {
    const mapped = krisByOrca.get(risk.id) || [];
    const openReviews = reviewsByOrca.get(risk.id) || [];
    const profile = risk.monitoringProfile;
    const monitoringStatus = getOrcaMonitoringStatus({
      kriMonitoringRequired: profile?.kriMonitoringRequired,
      mappedKris: mapped.map(mappedInput),
      openReviewCount: openReviews.length,
    });
    const latestKriStatus =
      mapped
        .map((kri) => latestStatus(kri.submissions, kri as unknown as Record<string, unknown>))
        .find((status) => status) || null;
    const band = residualBand(risk.residualRiskScore);
    return {
      id: risk.id,
      riskNo: risk.riskNo,
      processNo: risk.processNo,
      process: risk.process,
      riskThreat: risk.riskThreat,
      residualLikelihoodRating: risk.residualLikelihoodRating,
      residualImpactRating: risk.residualImpactRating,
      residualRiskScore: risk.residualRiskScore,
      residualBand: band,
      kriMonitoringRequired: profile?.kriMonitoringRequired ?? null,
      monitoringRationale: profile?.monitoringRationale ?? null,
      monitoringFrequency: profile?.monitoringFrequency ?? null,
      monitoringOwner: profile?.monitoringOwner ?? null,
      nextMonitoringReviewDate: profile?.nextMonitoringReviewDate ?? null,
      mappedKriCount: mapped.filter((kri) => !kri.archivedAt).length,
      mappedKris: mapped.map((kri) => {
        const currentSub = kri.submissions.find(
          (item) => item.year === current.year && item.month === current.month,
        );
        const openReview = openReviews.some((item) => item.kriRecordId === kri.id);
        const resultField = monthResultField(current.month);
        const monthResult = resultField
          ? ((kri as unknown as Record<string, unknown>)[resultField] as string | null)
          : null;
        const status = currentSub?.status || monthResult || null;
        return {
          id: kri.id,
          kriNumber: kri.kriNumber,
          keyRiskIndicator: kri.keyRiskIndicator,
          owner: kri.owner,
          frequency: kri.frequency,
          unit: kri.unit,
          archived: Boolean(kri.archivedAt),
          latestStatus: latestStatus(kri.submissions, kri as unknown as Record<string, unknown>),
          currentStatus: status,
          currentActual: currentSub?.actualValue ?? null,
          submissionStatus: getKriSubmissionStatus({
            frequency: kri.frequency,
            periodYear: current.year,
            periodMonth: current.month,
            now,
            status,
            hasSubmission: Boolean(currentSub || monthResult),
            openReview,
          }),
          threshold: kri.threshold,
        };
      }),
      monitoringStatus,
      latestKriStatus,
      openReviewCount: openReviews.length,
      openReviews,
      managementAttention: managementAttention({
        monitoringStatus,
        latestKriStatus,
        residualBand: band,
      }),
    };
  });
  const summary = summarize(rows.map((row) => row.monitoringStatus), risks.length);
  return { rows, summary };
}

function summarize(statuses: MonitoringStatus[], totalRisks: number) {
  const count = (status: MonitoringStatus) =>
    statuses.filter((item) => item === status).length;
  const monitoringRequired = statuses.filter(
    (item) =>
      item !== "Not Required" && item !== "Not Assessed",
  ).length;
  const requiredTrue = statuses.filter(
    (item) => !["Not Required", "Not Assessed"].includes(item),
  ).length;
  return {
    totalRisks,
    monitoringRequired: requiredTrue,
    covered: count("Covered"),
    partiallyCovered: count("Partially Covered"),
    unmapped: count("Unmapped"),
    notRequired: count("Not Required"),
    notAssessed: count("Not Assessed"),
    reviewRequired: count("Review Required"),
    coveragePercent: coveragePercent({
      monitoringRequired: requiredTrue,
      covered: count("Covered"),
      reviewRequired: count("Review Required"),
    }),
    monitoringRequiredCount: monitoringRequired,
  };
}

async function loadDashboard(prisma: PrismaClient) {
  const { rows, summary } = await loadCoverage(prisma);
  const now = new Date();
  const current = getCurrentKriPeriod(now);
  const previous = previousMonthlyPeriod(current.year, current.month);
  const kris = await prisma.kriRecord.findMany({
    where: { archivedAt: null, sheet: { status: "Active" } },
    include: { submissions: true, sheet: true },
  });
  const reviews = await prisma.orcaRiskReview.findMany();
  const health = { Good: 0, Warning: 0, Breached: 0, Missing: 0 };
  let overdue = 0;
  let onTime = 0;
  let expected = 0;
  for (const kri of kris) {
    const sub = kri.submissions.find(
      (item) => item.year === current.year && item.month === current.month,
    );
    const resultField = monthResultField(current.month);
    const monthResult = resultField
      ? ((kri as unknown as Record<string, unknown>)[resultField] as string | null)
      : null;
    const status = sub?.status || monthResult || null;
    if (status === "Good") health.Good += 1;
    else if (status === "Warning") health.Warning += 1;
    else if (status === "Breached") health.Breached += 1;
    else health.Missing += 1;
    const prevField = monthResultField(previous.month);
    const prevResult = prevField
      ? ((kri as unknown as Record<string, unknown>)[prevField] as string | null)
      : null;
    const prevSub = kri.submissions.find(
      (item) => item.year === previous.year && item.month === previous.month,
    );
    if (previous.year === kri.sheet.year || previous.year === current.year) {
      expected += 1;
      if (prevSub || prevResult) onTime += 1;
      else overdue += 1;
    }
  }
  const trendMonths = Array.from({ length: 6 }, (_, index) => {
    const cursor = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
    const year = cursor.getFullYear();
    const month = cursor.getMonth() + 1;
    const field = monthResultField(month);
    const counts = { month, year, Good: 0, Warning: 0, Breached: 0, Missing: 0 };
    for (const kri of kris) {
      if (kri.sheet.year !== year) continue;
      const sub = kri.submissions.find((item) => item.year === year && item.month === month);
      const monthResult = field
        ? ((kri as unknown as Record<string, unknown>)[field] as string | null)
        : null;
      const status = sub?.status || monthResult;
      if (status === "Good") counts.Good += 1;
      else if (status === "Warning") counts.Warning += 1;
      else if (status === "Breached") counts.Breached += 1;
      else counts.Missing += 1;
    }
    return counts;
  });
  const residual = { Critical: 0, High: 0, Medium: 0, Low: 0, Unrated: 0 };
  const attention = {
    Normal: 0,
    Watch: 0,
    "Management Attention": 0,
    "Unmonitored Exposure": 0,
  };
  let highCritical = 0;
  let highCriticalCovered = 0;
  for (const row of rows) {
    residual[row.residualBand] += 1;
    attention[row.managementAttention as keyof typeof attention] += 1;
    if (row.residualBand === "High" || row.residualBand === "Critical") {
      highCritical += 1;
      if (row.monitoringStatus === "Covered" || row.monitoringStatus === "Review Required") {
        highCriticalCovered += 1;
      }
    }
  }
  const resolved = reviews.filter((item) => item.status === "COMPLETED").length;
  const effectiveness = calculateMonitoringEffectiveness({
    coveragePercent: summary.coveragePercent,
    onTimeSubmissionPercent: expected ? (onTime / expected) * 100 : 100,
    resolvedReviewPercent: reviews.length ? (resolved / reviews.length) * 100 : 100,
    criticalCoveragePercent: highCritical ? (highCriticalCovered / highCritical) * 100 : 100,
  });
  const topRisks = rows
    .filter(
      (row) =>
        row.managementAttention === "Management Attention" ||
        row.managementAttention === "Unmonitored Exposure" ||
        row.monitoringStatus === "Review Required",
    )
    .slice(0, 8);
  return {
    summary: {
      ...summary,
      breachedKris: health.Breached,
      highCriticalResidual: residual.High + residual.Critical,
      overdueSubmissions: overdue,
      openReviews: summary.reviewRequired,
    },
    effectiveness,
    residual,
    health,
    trend: trendMonths,
    attention,
    topRisks,
    currentPeriod: current,
  };
}
