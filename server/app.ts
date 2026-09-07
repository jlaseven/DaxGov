import express from "express";
import cookieParser from "cookie-parser";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { differenceInCalendarDays } from "date-fns";
import {
  actorName,
  attachSession,
  currentUser,
  registerAuthRoutes,
  requireAuthAndPage,
  requirePasswordChange,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_SLIDE_AFTER_MS,
  SESSION_TTL_MS,
  verifyCurrentPassword,
} from "./auth.js";
import { registerUserRoutes } from "./users.js";
import { registerNotificationRoutes } from "./notifications.js";
import {
  deleteIsraAssessment,
  ensureDepartment,
  listDepartmentOptions,
  registerDepartmentRoutes,
} from "./departments.js";
import {
  ACTIVITY_CSV_COLUMNS,
  createLogger,
  formatActivityRow,
  toActivityCsv,
  withAuditContext,
} from "./activityLog.js";
import {
  auditMetrics,
  derivedStatus,
  effectiveDate,
  objectiveProgress,
  tcdStatus,
} from "./calculations.js";
import { documentStatusPies } from "./documentTypes.js";
import {
  certificationExpiration,
  nextTpsaId,
  tpsaChangeIssues,
  tpsaMetrics,
  tpsaProgress,
  tpsaSchema,
} from "./tpsa.js";
import {
  applyIsraRiskUpdate,
  departmentKey,
  israActionDueStatus,
  israImportSchema,
  israRiskUpdateSchema,
} from "./isra.js";
import {
  informationAssetUpdateSchema,
  loadInternalAssetResearchContext,
  parseDaxonResponses,
  presentInformationAsset,
  researchInformationAsset,
  syncInformationAssetsFromDaxon,
} from "./informationAssets.js";
import { parseResearchModels } from "./modelGarden.js";
import { assetResearchEnabled } from "./features.js";
import { parseIsraWorkbookBuffer } from "../client/src/israImport.js";
import {
  checkpointSqlite,
  createSnapshot,
  databaseStatus,
  listSnapshots,
  replaceDatabase,
  snapshotPath,
  writeUploadedDatabase,
} from "./backup.js";
import {
  applyTrustProxy,
  clientErrorMessage,
  helmetMiddleware,
  jsonReviver,
  noStoreApi,
  rejectForeignOrigins,
  requireRequestedWith,
} from "./security.js";
import { requestLog, writeAppLog } from "./appLog.js";
import { computeOrcaScores, orcaSchema } from "./orca.js";
import { registerKriRoutes } from "./kris.js";
import { registerRiskMonitoringRoutes } from "./riskMonitoringRoutes.js";
import { registerJumpCloudRoutes } from "./jumpcloud.js";
import { apiRateLimiter, rateLimitControls } from "./rateLimits.js";
import { registerSpaRoutes } from "./spa.js";

export const prisma = new PrismaClient();
const app = express();
app.disable("x-powered-by");
applyTrustProxy(app);
app.use(helmetMiddleware());
app.use(cookieParser());
app.use(rejectForeignOrigins());
app.use(requireRequestedWith());
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use(requestLog());
app.use("/api", noStoreApi());
app.use(
  "/api/settings/restore-upload",
  express.raw({ type: "application/octet-stream", limit: "80mb" }),
);
app.use(
  "/api/isra-spog/import-workbook",
  express.raw({
    type: [
      "application/octet-stream",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    limit: "8mb",
  }),
);
app.use(express.json({ limit: "15mb", reviver: jsonReviver }));
app.use("/api", apiRateLimiter());
app.use("/api", attachSession(prisma));
app.use("/api", withAuditContext());
app.use("/api", requireAuthAndPage());
app.use("/api", requirePasswordChange());
const date = z
  .string()
  .date()
  .nullish()
  .transform((v) => (v ? new Date(v) : null));
const opt = z.string().trim().max(10000).nullish();
const schemas = {
  documents: z.object({
    documentName: z.string().trim().min(1),
    status: z.enum([
      "Outdated",
      "Non-existent",
      "Currently Updating",
      "Updated",
      "For Decommissioning",
    ]),
    cybersecurityPillar: z.enum([
      "Governance",
      "IAM",
      "Cyber Defense",
      "Workplace",
      "Not Cybersecurity",
    ]),
    commentsRemarks: opt,
    applicableStandards: opt,
    applicableBspRegulations: opt,
  }),
  "opir-actions": z.object({
    opirNumber: z.string().trim().min(1),
    squad: opt,
    riskRating: z.enum([
      "Critical",
      "High",
      "Medium",
      "Low",
      "Informational",
      "Unrated",
    ]),
    incidentTitle: z.string().trim().min(1),
    actionOwner: opt,
    solution: opt,
    originalTargetDate: date,
    updatedTargetDate: date,
    remarks: opt,
    jiraTicket: opt,
    actionStatus: z.enum([
      "Todo",
      "In Progress",
      "Blocked",
      "Completed",
      "Cancelled",
    ]),
    lastUpdateDate: date.optional(),
  }),
  "audit-findings": z.object({
    findingNumber: z.string().trim().min(1),
    year: z.number().int().nullish(),
    observationId: opt,
    division: opt,
    departmentProcess: opt,
    auditObservation: z.string().trim().min(1),
    observationDetails: opt,
    riskLevel: z.enum([
      "Critical",
      "High",
      "Medium",
      "Low",
      "Informational",
      "Unrated",
    ]),
    rootCause: opt,
    risks: opt,
    impact: opt,
    recommendation: opt,
    managementResponse: opt,
    commitmentActionPlan: opt,
    responsibleDepartment: opt,
    responsiblePersonnel: opt,
    reportDate: date,
    exitMeetingDate: date,
    originalTargetDate: date,
    updatedTargetDate: date,
    managementStatus: opt,
    findingStatus: z.enum(["Open", "Evidence Submitted", "Closed"]),
    remarks: opt,
    evidenceReferences: opt,
  }),
  objectives: z.object({
    objectiveId: z.string().trim().min(1),
    objectiveName: z.string().trim().min(1),
    objectiveStatus: z.string().default("Todo"),
    assignees: opt,
    contributors: opt,
    startDate: date,
    endDate: date,
    manualProgressOverride: z.number().min(0).max(100).nullish(),
  }),
  "okr-tasks": z.object({
    objectiveId: z.number().int(),
    taskName: z.string().trim().min(1),
    taskStatus: z.enum([
      "Todo",
      "In Progress",
      "In Progress – At Risk",
      "Done",
      "Deferred",
    ]),
    assignees: opt,
    contributors: opt,
    startDate: date,
    endDate: date,
    remarks: opt,
  }),
  initiatives: z.object({
    category: z.string().trim().min(1),
    initiativeName: z.string().trim().min(1),
    description: opt,
    owner: opt,
    startDate: date,
    endDate: date,
    status: z.enum([
      "Todo",
      "In Progress",
      "In Progress – At Risk",
      "Done",
      "Deferred",
    ]),
    manualOverride: z.boolean().default(false),
  }),
  "sub-initiatives": z.object({
    initiativeId: z.number().int(),
    subInitiativeName: z.string().trim().min(1),
    owner: opt,
    startDate: date,
    endDate: date,
    status: z.enum([
      "Todo",
      "In Progress",
      "In Progress – At Risk",
      "Done",
      "Deferred",
    ]),
    remarks: opt,
  }),
  settings: z.object({
    key: z.string().trim().min(1),
    value: z.string().max(10000),
  }),
  orca: orcaSchema,
} as const;
const models: any = {
  documents: prisma.governanceDocument,
  "opir-actions": prisma.opirAction,
  "audit-findings": prisma.auditFinding,
  objectives: prisma.objective,
  "okr-tasks": prisma.okrTask,
  initiatives: prisma.initiative,
  "sub-initiatives": prisma.subInitiative,
  settings: prisma.applicationSetting,
  orca: prisma.orcaRisk,
};
const log = createLogger(prisma);
registerAuthRoutes(app, prisma, log);
registerJumpCloudRoutes(app, prisma, log);
registerUserRoutes(app, prisma, log);
registerNotificationRoutes(app, prisma);
registerDepartmentRoutes(app, prisma, log);
registerKriRoutes(app, prisma, log);
registerRiskMonitoringRoutes(app, prisma, log);
for (const [route, schema] of Object.entries(schemas)) {
  const model = models[route];
  app.get("/api/" + route, async (req, res, next) => {
    try {
      const exportAll = String(req.query.all) === "true";
      const page = Math.max(1, Number(req.query.page) || 1),
        pageSize = exportAll
          ? 0
          : Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
      const archived = req.query.archived === "true";
      const where: any =
        route === "settings"
          ? {}
          : { archivedAt: archived ? { not: null } : null };
      const search = String(req.query.search || "").trim();
      const searchFields: any = {
        documents: ["documentName"],
        "opir-actions": ["opirNumber", "incidentTitle", "actionOwner"],
        "audit-findings": [
          "findingNumber",
          "auditObservation",
          "responsiblePersonnel",
        ],
        objectives: ["objectiveId", "objectiveName"],
        initiatives: ["initiativeName", "category"],
        "okr-tasks": ["taskName"],
        "sub-initiatives": ["subInitiativeName"],
        orca: ["riskNo", "processNo", "process", "riskThreat", "cause"],
      };
      if (search && searchFields[route])
        where.OR = searchFields[route].map((f: string) => ({
          [f]: { contains: search },
        }));
      for (const [k, v] of Object.entries(req.query))
        if (k.startsWith("filter.") && v) where[k.slice(7)] = String(v);
      const include =
        route === "objectives"
          ? { tasks: true }
          : route === "initiatives"
            ? { subInitiatives: true }
            : undefined;
      const derived = {
        tcdStatus: String(req.query.tcdStatus || ""),
        overdueStatus: String(req.query.overdueStatus || ""),
        progressStatus: String(req.query.progressStatus || ""),
        calculatedStatus: String(req.query.calculatedStatus || ""),
      };
      const needsDerived =
        (route === "opir-actions" && derived.tcdStatus) ||
        (route === "audit-findings" && derived.overdueStatus) ||
        (route === "objectives" && derived.progressStatus) ||
        (route === "initiatives" && derived.calculatedStatus);
      const orderBy =
        route === "orca"
          ? { sortOrder: "asc" as const }
          : {
              [String(req.query.sort || "updatedAt")]:
                req.query.order === "asc" ? "asc" : "desc",
            };
      const records = await model.findMany({
        where,
        include,
        orderBy,
        ...(needsDerived || exportAll
          ? {}
          : { skip: (page - 1) * pageSize, take: pageSize }),
      });
      let out = records;
      if (route === "opir-actions")
        out = records.map((x: any) => ({
          ...x,
          effectiveTargetDate: effectiveDate(x),
          tcdStatus: tcdStatus(x),
        }));
      if (route === "audit-findings")
        out = records.map((x: any) => ({
          ...x,
          effectiveTargetDate: effectiveDate(x),
          ...auditMetrics(x),
        }));
      if (route === "objectives")
        out = records.map((x: any) => ({
          ...x,
          progress: objectiveProgress(x.tasks),
        }));
      if (route === "initiatives")
        out = records.map((x: any) => ({
          ...x,
          calculatedStatus: x.manualOverride
            ? x.status
            : derivedStatus(x.subInitiatives, x.status),
        }));
      if (route === "opir-actions" && derived.tcdStatus)
        out = out.filter((x: any) => x.tcdStatus === derived.tcdStatus);
      if (route === "audit-findings" && derived.overdueStatus)
        out = out.filter((x: any) => x.overdueStatus === derived.overdueStatus);
      if (route === "objectives" && derived.progressStatus)
        out = out.filter(
          (x: any) => x.progress?.status === derived.progressStatus,
        );
      if (route === "initiatives" && derived.calculatedStatus)
        out = out.filter(
          (x: any) => x.calculatedStatus === derived.calculatedStatus,
        );
      const total = needsDerived ? out.length : await model.count({ where });
      if (needsDerived && !exportAll)
        out = out.slice((page - 1) * pageSize, page * pageSize);
      res.json({
        data: out,
        meta: {
          page: exportAll ? 1 : page,
          pageSize: exportAll ? out.length : pageSize,
          total,
          totalPages: exportAll
            ? 1
            : Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    } catch (e) {
      next(e);
    }
  });
  app.post("/api/" + route, async (req, res, next) => {
    try {
      let data = (schema as any).parse(req.body);
      if (route === "orca") data = { ...data, ...computeOrcaScores(data) };
      const row = await model.create({ data });
      await log(route, row.id, "Created", null, data);
      res.status(201).json({ data: row });
    } catch (e) {
      next(e);
    }
  });
  app.put("/api/" + route + "/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const prev = await model.findUnique({ where: { id } });
      if (!prev) return res.status(404).json({ error: "Record not found" });
      let data = (schema as any).partial().parse(req.body);
      if (route === "orca")
        data = { ...data, ...computeOrcaScores({ ...prev, ...data }) };
      const row = await model.update({ where: { id }, data });
      await log(route, id, "Edited", prev, data);
      res.json({ data: row });
    } catch (e) {
      next(e);
    }
  });
  if (route !== "settings") {
    app.post("/api/" + route + "/:id/archive", async (req, res, next) => {
      try {
        const id = Number(req.params.id),
          row = await model.update({
            where: { id },
            data: { archivedAt: new Date() },
          });
        await log(route, id, "Archived");
        res.json({ data: row });
      } catch (e) {
        next(e);
      }
    });
    app.post("/api/" + route + "/:id/restore", async (req, res, next) => {
      try {
        const id = Number(req.params.id),
          row = await model.update({
            where: { id },
            data: { archivedAt: null },
          });
        await log(route, id, "Restored");
        res.json({ data: row });
      } catch (e) {
        next(e);
      }
    });
  }
}
app.get("/api/activity-log", async (req, res, next) => {
  try {
    const csv = String(req.query.format || "") === "csv";
    const rows = await prisma.activityLog.findMany({
      take: csv ? 10_000 : 100,
      orderBy: { createdAt: "desc" },
    });
    const data = rows.map(formatActivityRow);
    if (csv) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="cybergov-activity-log.csv"',
      );
      return res.send(toActivityCsv(data));
    }
    res.json({
      data,
      meta: { columns: [...ACTIVITY_CSV_COLUMNS] },
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const [docs, opir, audits, objectives, initiatives, tpsa, israRisks, activity] =
      await Promise.all([
        prisma.governanceDocument.findMany({ where: { archivedAt: null } }),
        prisma.opirAction.findMany({ where: { archivedAt: null } }),
        prisma.auditFinding.findMany({ where: { archivedAt: null } }),
        prisma.objective.findMany({
          where: { archivedAt: null },
          include: { tasks: true },
        }),
        prisma.initiative.findMany({
          where: { archivedAt: null },
          include: { subInitiatives: true },
        }),
        prisma.tpsaRecord.findMany({
          where: { archivedAt: null },
          include: { certifications: true },
        }),
        prisma.israRisk.findMany({
          where: { assessment: { isActive: true } },
        }),
        prisma.activityLog.findMany({
          take: 8,
          orderBy: { createdAt: "desc" },
        }),
      ]);
    const count = (a: any[], k: string) =>
      Object.entries(
        a.reduce((o: any, x: any) => ((o[x[k]] = (o[x[k]] || 0) + 1), o), {}),
      ).map(([name, value]) => ({ name, value }));
    const tpsaRows = tpsa.map((record) => ({
      ...record,
      ...tpsaMetrics(record),
    }));
    const tpsaTotals = tpsaProgress(tpsaRows);
    res.json({
      data: {
        kpis: {
          totalDocuments: docs.length,
          updatedDocuments: docs.filter((x) => x.status === "Updated").length,
          outdatedDocuments: docs.filter((x) => x.status === "Outdated").length,
          updatingDocuments: docs.filter(
            (x) => x.status === "Currently Updating",
          ).length,
          nonExistentDocuments: docs.filter((x) => x.status === "Non-existent")
            .length,
          decommissioningDocuments: docs.filter(
            (x) => x.status === "For Decommissioning",
          ).length,
          openOpir: opir.filter(
            (x) => !["Completed", "Cancelled"].includes(x.actionStatus),
          ).length,
          overdueOpir: opir.filter((x) => tcdStatus(x) === "Overdue").length,
          noTcdOpir: opir.filter((x) => tcdStatus(x) === "No TCD").length,
          openFindings: audits.filter((x) => x.findingStatus !== "Closed")
            .length,
          highRiskFindings: audits.filter(
            (x) =>
              ["Critical", "High"].includes(x.riskLevel) &&
              x.findingStatus !== "Closed",
          ).length,
          activeOkrs: objectives.filter(
            (x) => objectiveProgress(x.tasks).status !== "Done",
          ).length,
          completedInitiatives: initiatives.filter(
            (x) => derivedStatus(x.subInitiatives, x.status) === "Done",
          ).length,
          totalTpsa: tpsaRows.length,
          overdueTpsa: tpsaRows.filter(
            (record: any) => !record.submittedDate && record.daysOverdue > 0,
          ).length,
          readyToSendTpsa: tpsaTotals.readyToSend,
          totalIsraRisks: israRisks.length,
          criticalIsraRisks: israRisks.filter(
            (risk) => risk.inherentRating === "Critical",
          ).length,
          overdueIsraActions: israRisks.filter(
            (risk) => israActionDueStatus(risk) === "Overdue",
          ).length,
        },
        charts: {
          tpsaByStatus: count(tpsaRows, "status"),
          israByRating: count(israRisks, "inherentRating"),
          documentStatuses: count(docs, "status"),
          documentStatusPies: documentStatusPies(docs),
          documentsByPillar: count(docs, "cybersecurityPillar"),
          opirRisk: count(
            opir.filter((x) => tcdStatus(x) === "Overdue"),
            "riskRating",
          ),
          auditRisk: count(audits, "riskLevel"),
          okrStatus: count(
            objectives.map((x) => ({
              status: objectiveProgress(x.tasks).status,
            })),
            "status",
          ),
          initiativeStatus: count(
            initiatives.map((x) => ({
              status: derivedStatus(x.subInitiatives, x.status),
            })),
            "status",
          ),
        },
        activity: activity.map(formatActivityRow),
      },
    });
  } catch (e) {
    next(e);
  }
});

const relatedDate = z
  .union([
    z.date(),
    z
      .string()
      .date()
      .transform((value) => new Date(`${value}T00:00:00`)),
  ])
  .nullish()
  .transform((value) => value || null);
const certificationSchema = z
  .object({
    certificationType: z.string().trim().min(1),
    documentName: z.string().trim().min(1),
    url: z
      .string()
      .url()
      .refine(
        (value) => /^https?:\/\//i.test(value),
        "URL must start with http:// or https://",
      ),
    issuingOrganization: opt,
    issueDate: relatedDate,
    expirationDate: relatedDate,
    legalEntityCovered: opt,
    productServiceCovered: opt,
    scopeNotes: opt,
    reviewStatus: z.enum([
      "Pending Review",
      "Valid and Accepted",
      "Partially Accepted",
      "Expiring Soon",
      "Expired",
      "Out of Scope",
      "Rejected",
    ]),
    reviewDate: relatedDate,
    reviewedBy: opt,
    reviewNotes: opt,
  })
  .superRefine((value, context) => {
    const { issueDate, expirationDate } = value;
    if (issueDate && expirationDate && expirationDate < issueDate)
      context.addIssue({
        code: "custom",
        path: ["expirationDate"],
        message: "Certification expiration cannot be before issue date",
      });
  });
const followUpSchema = z.object({
  followUpDate: date.refine(Boolean, "Follow-up date is required"),
  method: z.enum([
    "Email",
    "Meeting",
    "Chat",
    "Call",
    "Internal Coordination",
    "Other",
  ]),
  personContacted: opt,
  organizationDepartment: opt,
  notes: opt,
  responseReceived: z.boolean(),
  responseSummary: opt,
  recordedBy: z.string().trim().min(1).optional(),
});

async function nextTpsaReference(client: any = prisma) {
  const year = new Date().getFullYear();
  const latest = await client.tpsaRecord.findFirst({
    where: { tpsaReference: { startsWith: `TPSA-${year}-` } },
    orderBy: { tpsaReference: "desc" },
    select: { tpsaReference: true },
  });
  return nextTpsaId(year, latest?.tpsaReference);
}
const tpsaInclude = {
  certifications: { orderBy: { createdAt: "desc" as const } },
  followUps: { orderBy: { followUpDate: "desc" as const } },
};
const enrichTpsa = (record: any) => ({
  ...record,
  ...tpsaMetrics(record),
  certifications: record.certifications.map((item: any) => ({
    ...item,
    expirationClassification: certificationExpiration(item.expirationDate),
  })),
});

app.get("/api/tpsa-records", async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize) || 25),
    );
    const search = String(req.query.search || "").trim();
    const where: any = {
      archivedAt: req.query.archived === "true" ? { not: null } : null,
    };
    if (search)
      where.OR = [
        "tpsaReference",
        "vendorName",
        "productService",
        "businessProcessOwner",
        "department",
        "reviewerName",
      ].map((field) => ({ [field]: { contains: search } }));
    const allRecords = (
      await prisma.tpsaRecord.findMany({
        where,
        include: tpsaInclude,
        orderBy: { updatedAt: "desc" },
      })
    ).map(enrichTpsa);
    const filterKeys = [
      "vendorTier",
      "assessmentType",
      "status",
      "verdict",
      "reviewerName",
      "rafStatus",
    ];
    const facets = Object.fromEntries(
      filterKeys.map((key) => [
        key,
        [
          ...new Set(
            allRecords.map((record: any) => record[key]).filter(Boolean),
          ),
        ].sort(),
      ]),
    );
    const quick = String(req.query.quick || "");
    const matchesQuick = (record: any) => {
      if (!quick) return true;
      if (quick.startsWith("status:")) return record.status === quick.slice(7);
      if (quick.startsWith("verdict:"))
        return record.verdict === quick.slice(8);
      if (quick === "overdue")
        return !record.submittedDate && record.daysOverdue > 0;
      if (quick === "critical") return record.openCriticalFindings > 0;
      if (quick === "high") return record.openHighFindings > 0;
      if (quick === "cert90") {
        if (!record.earliestCertificationExpirationDate) return false;
        const days = differenceInCalendarDays(
          new Date(record.earliestCertificationExpirationDate),
          new Date(),
        );
        return days >= 0 && days <= 90;
      }
      return true;
    };
    const filtered = allRecords
      .filter((record: any) =>
        filterKeys.every(
          (key) => !req.query[key] || record[key] === String(req.query[key]),
        ),
      )
      .filter(matchesQuick);
    const total = filtered.length;
    const records = filtered.slice((page - 1) * pageSize, page * pageSize);
    res.json({
      data: records,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
        facets,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tpsa-records/summary", async (_req, res, next) => {
  try {
    const records = (
      await prisma.tpsaRecord.findMany({
        where: { archivedAt: null },
        include: tpsaInclude,
      })
    ).map(enrichTpsa);
    const countStatus = (status: string) =>
      records.filter((record: any) => record.status === status).length;
    const now = new Date();
    const within90 = (value: Date | string | null) =>
      value &&
      differenceInCalendarDays(new Date(value), now) >= 0 &&
      differenceInCalendarDays(new Date(value), now) <= 90;
    const cards = {
      total: records.length,
      readyToSend: countStatus("Ready to Send"),
      sent: countStatus("Sent"),
      awaitingSubmission: countStatus("Awaiting Vendor Submission"),
      overdueSubmissions: records.filter(
        (record: any) => !record.submittedDate && record.daysOverdue > 0,
      ).length,
      submitted: countStatus("Submitted"),
      underReview: countStatus("Under Cybersecurity Review"),
      clarification: countStatus("Clarification Required"),
      evidence: countStatus("Additional Evidence Required"),
      remediation: countStatus("Remediation Required"),
      passed: records.filter((record: any) => record.verdict === "Passed")
        .length,
      reassessment: records.filter(
        (record: any) => record.verdict === "Reassessment Required",
      ).length,
      assessmentFailed: records.filter(
        (record: any) => record.verdict === "Security Assessment Failed",
      ).length,
      critical: records.reduce(
        (sum: number, record: any) => sum + record.openCriticalFindings,
        0,
      ),
      high: records.reduce(
        (sum: number, record: any) => sum + record.openHighFindings,
        0,
      ),
      expiringCertifications: records.filter((record: any) =>
        within90(record.earliestCertificationExpirationDate),
      ).length,
    };
    const attention = records
      .flatMap((record: any) => {
        const reasons: string[] = [];
        const submissionDays = record.submissionDeadline
          ? differenceInCalendarDays(new Date(record.submissionDeadline), now)
          : null;
        if (!record.submittedDate && record.daysOverdue > 0)
          reasons.push(`${record.daysOverdue} days overdue for submission`);
        else if (
          !record.submittedDate &&
          submissionDays !== null &&
          submissionDays >= 0 &&
          submissionDays <= 7
        )
          reasons.push(
            submissionDays === 0
              ? "Vendor submission due today"
              : `Vendor submission due in ${submissionDays} days`,
          );
        if (record.openCriticalFindings)
          reasons.push(
            `${record.openCriticalFindings} open Critical finding(s)`,
          );
        if (record.openHighFindings)
          reasons.push(`${record.openHighFindings} open High finding(s)`);
        if (
          [
            "Clarification Required",
            "Additional Evidence Required",
            "Remediation Required",
          ].includes(record.status)
        )
          reasons.push(record.status);
        if (record.rafStatus === "Pending Approval")
          reasons.push("RAF awaiting approval");
        if (record.rafExpirationDate) {
          const rafDays = differenceInCalendarDays(
            new Date(record.rafExpirationDate),
            now,
          );
          if (rafDays < 0) reasons.push("RAF expired");
          else if (rafDays <= 90) reasons.push("RAF expiring within 90 days");
        }
        if (
          record.remediationDeadline &&
          record.status === "Remediation Required"
        ) {
          const remediationDays = differenceInCalendarDays(
            new Date(record.remediationDeadline),
            now,
          );
          if (remediationDays < 0) reasons.push("Remediation deadline overdue");
          else if (remediationDays <= 7)
            reasons.push("Remediation deadline due within seven days");
        }
        if (["Sent", "Awaiting Vendor Submission"].includes(record.status)) {
          const followUpBaseline = record.lastFollowUpDate || record.sentDate;
          if (
            followUpBaseline &&
            differenceInCalendarDays(now, new Date(followUpBaseline)) >= 7
          )
            reasons.push("No follow-up within seven days");
        }
        if (
          record.certifications.some(
            (item: any) => item.expirationClassification === "Expired",
          )
        )
          reasons.push("Certification expired");
        else if (
          record.earliestCertificationExpirationDate &&
          differenceInCalendarDays(
            new Date(record.earliestCertificationExpirationDate),
            now,
          ) <= 90
        )
          reasons.push("Certification expiring within 90 days");
        return reasons.map((reason) => ({
          id: record.id,
          tpsaReference: record.tpsaReference,
          vendorName: record.vendorName,
          reason,
        }));
      })
      .slice(0, 20);
    res.json({ data: { cards, progress: tpsaProgress(records), attention } });
  } catch (error) {
    next(error);
  }
});

app.get("/api/tpsa-records/:id", async (req, res, next) => {
  try {
    const record = await prisma.tpsaRecord.findUnique({
      where: { id: Number(req.params.id) },
      include: tpsaInclude,
    });
    if (!record)
      return res.status(404).json({ error: "TPSA record not found" });
    res.json({ data: enrichTpsa(record) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tpsa-records", async (req, res, next) => {
  try {
    const data = tpsaSchema.parse(req.body);
    let record: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        record = await prisma.tpsaRecord.create({
          data: {
            ...data,
            tpsaReference: await nextTpsaReference(),
            createdBy: actorName(res),
            updatedBy: actorName(res),
          },
          include: tpsaInclude,
        });
        break;
      } catch (error: any) {
        if (error.code !== "P2002" || attempt === 2) throw error;
      }
    }
    await log(
      "tpsa-records",
      record.id,
      "Created",
      null,
      {
        tpsaReference: record.tpsaReference,
        vendorName: record.vendorName,
        status: record.status,
      },
      { targetName: record.tpsaReference, httpStatus: 201 },
    );
    res.status(201).json({ data: enrichTpsa(record) });
  } catch (error) {
    next(error);
  }
});

app.put("/api/tpsa-records/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const previous = await prisma.tpsaRecord.findUnique({ where: { id } });
    if (!previous)
      return res.status(404).json({ error: "TPSA record not found" });
    const data = tpsaSchema.parse({ ...previous, ...req.body });
    const changeMetadata = {
      changeReason: req.body.changeReason,
      rafLinkReplacementConfirmed: req.body.rafLinkReplacementConfirmed,
    };
    const changeIssues = tpsaChangeIssues(previous, data, changeMetadata);
    if (changeIssues.length)
      return res.status(400).json({
        error: "Change justification required",
        details: { fieldErrors: { changeReason: changeIssues } },
      });
    const record = await prisma.tpsaRecord.update({
      where: { id },
      data: { ...data, updatedBy: actorName(res) },
      include: tpsaInclude,
    });
    const changed = [
      "status",
      "verdict",
      "vendorTier",
      "submissionDeadline",
      "remediationDeadline",
      "rafStatus",
      "rafLink",
    ].filter(
      (field) =>
        String((previous as any)[field] ?? "") !==
        String((record as any)[field] ?? ""),
    );
    await log(
      "tpsa-records",
      id,
      "Edited",
      { fields: changed },
      { fields: changed, tpsaReference: record.tpsaReference },
    );
    for (const field of changed) {
      const action =
        field === "verdict"
          ? "Final Verdict Changed"
          : field === "vendorTier"
            ? "Vendor Tier Changed"
            : ["submissionDeadline", "remediationDeadline"].includes(field)
              ? "Deadline Changed"
              : field === "rafLink"
                ? "RAF Link Changed"
                : "Field Changed";
      await log(
        "tpsa-records",
        id,
        action,
        (previous as any)[field],
        {
          value: String((record as any)[field] ?? ""),
          reason: changeMetadata.changeReason || null,
        },
        {
          fieldsChanged: field,
          targetName: record.tpsaReference,
        },
      );
    }
    res.json({ data: enrichTpsa(record) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tpsa-records/:id/archive", async (req, res, next) => {
  try {
    const reason = z
      .string()
      .trim()
      .min(1, "Archive reason is required")
      .parse(req.body.reason);
    const id = Number(req.params.id);
    const previous = await prisma.tpsaRecord.findUnique({ where: { id } });
    if (!previous)
      return res.status(404).json({ error: "TPSA record not found" });
    const record = await prisma.tpsaRecord.update({
      where: { id },
      data: {
        archivedAt: new Date(),
        archiveReason: reason,
        statusBeforeArchive: previous.status,
        status: "Archived",
      },
    });
    await log("tpsa-records", record.id, "Archived", null, {
      tpsaReference: record.tpsaReference,
      reason,
    });
    res.json({ data: record });
  } catch (error) {
    next(error);
  }
});
app.post("/api/tpsa-records/:id/restore", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const previous = await prisma.tpsaRecord.findUnique({ where: { id } });
    if (!previous)
      return res.status(404).json({ error: "TPSA record not found" });
    const record = await prisma.tpsaRecord.update({
      where: { id },
      data: {
        archivedAt: null,
        archiveReason: null,
        status: previous.statusBeforeArchive || "Draft",
        statusBeforeArchive: null,
      },
    });
    await log("tpsa-records", record.id, "Restored", null, {
      tpsaReference: record.tpsaReference,
    });
    res.json({ data: record });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tpsa-records/:id/certifications", async (req, res, next) => {
  try {
    const data = certificationSchema.parse(req.body);
    const item = await prisma.tpsaCertification.create({
      data: {
        ...data,
        tpsaRecordId: Number(req.params.id),
        createdBy: actorName(res),
        updatedBy: actorName(res),
      },
    });
    await log("tpsa-certification", item.id, "Created", null, {
      tpsaRecordId: item.tpsaRecordId,
      certificationType: item.certificationType,
    });
    res.status(201).json({ data: item });
  } catch (error) {
    next(error);
  }
});
app.put("/api/tpsa-certifications/:id", async (req, res, next) => {
  try {
    const previous = await prisma.tpsaCertification.findUnique({
      where: { id: Number(req.params.id) },
    });
    if (!previous)
      return res.status(404).json({ error: "Certification not found" });
    const data = certificationSchema.parse({ ...previous, ...req.body });
    const item = await prisma.tpsaCertification.update({
      where: { id: previous.id },
      data: { ...data, updatedBy: actorName(res) },
    });
    await log("tpsa-certification", item.id, "Edited", null, {
      tpsaRecordId: item.tpsaRecordId,
      certificationType: item.certificationType,
    });
    res.json({ data: item });
  } catch (error) {
    next(error);
  }
});
app.delete("/api/tpsa-certifications/:id", async (req, res, next) => {
  try {
    const item = await prisma.tpsaCertification.delete({
      where: { id: Number(req.params.id) },
    });
    await log("tpsa-certification", item.id, "Removed", null, {
      tpsaRecordId: item.tpsaRecordId,
      certificationType: item.certificationType,
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/tpsa-records/:id/follow-ups", async (req, res, next) => {
  try {
    const tpsaRecordId = Number(req.params.id);
    const data = followUpSchema.parse(req.body);
    const item = await prisma.tpsaFollowUp.create({
      data: {
        ...data,
        followUpDate: data.followUpDate!,
        tpsaRecordId,
        recordedBy: actorName(res),
      },
    });
    await prisma.tpsaRecord.update({
      where: { id: tpsaRecordId },
      data: {
        lastFollowUpDate: data.followUpDate,
      },
    });
    await log("tpsa-follow-up", item.id, "Created", null, {
      tpsaRecordId,
      method: item.method,
      followUpDate: item.followUpDate,
    });
    res.status(201).json({ data: item });
  } catch (error) {
    next(error);
  }
});

app.post("/api/tpsa-records/:id/reassessment", async (req, res, next) => {
  try {
    const source = await prisma.tpsaRecord.findUnique({
      where: { id: Number(req.params.id) },
      include: { certifications: true },
    });
    if (!source)
      return res.status(404).json({ error: "TPSA record not found" });
    const trigger = z
      .string()
      .trim()
      .min(1, "Reassessment trigger is required")
      .parse(req.body.trigger);
    const assessmentType = z
      .enum([
        "Evidence-Based Reassessment",
        "Scoped Reassessment",
        "Full Reassessment",
      ])
      .parse(req.body.assessmentType);
    const reference = await nextTpsaReference();
    const record = await prisma.tpsaRecord.create({
      data: {
        tpsaReference: reference,
        vendorName: source.vendorName,
        productService: source.productService,
        businessProcessOwner: source.businessProcessOwner,
        department: source.department,
        reviewerName: source.reviewerName,
        vendorType: "Existing Vendor",
        vendorTier: source.vendorTier,
        tierJustification:
          source.tierJustification ||
          "Carried forward from previous assessment",
        assessmentType,
        reassessmentTrigger: trigger,
        status: "Draft",
        previousAssessmentId: source.id,
        openCriticalFindings: source.openCriticalFindings,
        openHighFindings: source.openHighFindings,
        openMediumFindings: source.openMediumFindings,
        openLowFindings: source.openLowFindings,
        createdBy: actorName(res),
        updatedBy: actorName(res),
        certifications: {
          create: source.certifications.map((item) => ({
            certificationType: item.certificationType,
            documentName: item.documentName,
            url: item.url,
            issuingOrganization: item.issuingOrganization,
            issueDate: item.issueDate,
            expirationDate: item.expirationDate,
            legalEntityCovered: item.legalEntityCovered,
            productServiceCovered: item.productServiceCovered,
            scopeNotes: item.scopeNotes,
            reviewStatus:
              item.expirationDate && item.expirationDate < new Date()
                ? "Expired"
                : "Pending Review",
            createdBy: actorName(res),
            updatedBy: actorName(res),
          })),
        },
      },
      include: tpsaInclude,
    });
    await log(
      "tpsa-records",
      record.id,
      "Duplicated for Reassessment",
      { previousAssessmentId: source.id },
      { tpsaReference: record.tpsaReference, trigger },
    );
    res.status(201).json({ data: enrichTpsa(record) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/isra-spog", async (req, res, next) => {
  try {
    const selectedDepartment = String(req.query.department || "").trim();
    const where = {
      isActive: true,
      ...(selectedDepartment ? { departmentKey: selectedDepartment } : {}),
    };
    const [assessments, recentImports] = await Promise.all([
      prisma.israAssessment.findMany({
        where,
        include: { risks: true, qualityFindings: true },
        orderBy: { department: "asc" },
      }),
      prisma.israAssessment.findMany({
        take: 50,
        orderBy: { importedAt: "desc" },
        select: {
          id: true,
          department: true,
          departmentKey: true,
          sourceFile: true,
          sourceSheet: true,
          sourceType: true,
          respondentName: true,
          riskCount: true,
          qualityFindingCount: true,
          importedAt: true,
          isActive: true,
        },
      }),
    ]);
    const activeDepartments = await listDepartmentOptions(prisma);
    res.json({
      data: {
        scope: selectedDepartment || "all",
        departments: activeDepartments,
        assessments: assessments.map(({ risks, qualityFindings, ...item }) => ({
          ...item,
          riskCount: risks.length,
          qualityFindingCount: qualityFindings.length,
        })),
        risks: assessments.flatMap((assessment) =>
          assessment.risks.map((risk) => ({
            ...risk,
            department: assessment.department,
            departmentKey: assessment.departmentKey,
            sourceFile: assessment.sourceFile,
            importedAt: assessment.importedAt,
          })),
        ),
        findings: assessments.flatMap((assessment) =>
          assessment.qualityFindings.map((finding) => ({
            ...finding,
            department: assessment.department,
            departmentKey: assessment.departmentKey,
            sourceFile: assessment.sourceFile,
          })),
        ),
        recentImports,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/isra-spog/daxon-answers", async (req, res, next) => {
  try {
    const selectedDepartment = String(req.query.department || "").trim();
    const sourceWhere = { sourceType: "Daxon Questionnaire" };
    const [assessments, departmentRows] = await Promise.all([
      prisma.israAssessment.findMany({
        where: {
          ...sourceWhere,
          ...(selectedDepartment ? { departmentKey: selectedDepartment } : {}),
        },
        select: {
          id: true,
          department: true,
          departmentKey: true,
          respondentName: true,
          questionnaireResponses: true,
          riskCount: true,
          importedAt: true,
          isActive: true,
        },
        orderBy: { importedAt: "desc" },
      }),
      listDepartmentOptions(prisma),
    ]);
    const departments = departmentRows;
    res.json({
      data: {
        scope: selectedDepartment || "all",
        departments,
        assessments: assessments.map(
          ({ questionnaireResponses, ...assessment }) => {
            let responses: Record<string, string | number | boolean> = {};
            try {
              const parsed = JSON.parse(questionnaireResponses || "{}");
              if (
                parsed &&
                typeof parsed === "object" &&
                !Array.isArray(parsed)
              )
                responses = parsed;
            } catch {
              responses = {};
            }
            return { ...assessment, questionnaireResponses: responses };
          },
        ),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/isra-spog/import-workbook", async (req, res, next) => {
  try {
    const department = String(
      req.query.department || req.headers["x-department"] || "",
    ).trim();
    const fileName = String(
      req.query.fileName || req.headers["x-file-name"] || "isra.xlsx",
    );
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (!department)
      return res.status(400).json({ error: "Enter the department for this ISRA." });
    if (!buffer.length)
      return res.status(400).json({ error: "Select an ISRA workbook to import." });
    const parsed = parseIsraWorkbookBuffer(buffer, fileName);
    const data = israImportSchema.parse({
      department,
      sourceFile: fileName,
      sourceSheet: parsed.sourceSheet,
      sourceType: "Workbook",
      risks: parsed.risks,
      findings: parsed.findings,
    });
    req.body = data;
    const normalizedDepartment = data.department.replace(/\s+/g, " ").trim();
    const key = departmentKey(normalizedDepartment);
    const assessment = await prisma.$transaction(async (transaction) => {
      await ensureDepartment(transaction, normalizedDepartment);
      await transaction.israAssessment.updateMany({
        where: { departmentKey: key, isActive: true },
        data: { isActive: false },
      });
      return transaction.israAssessment.create({
        data: {
          department: normalizedDepartment,
          departmentKey: key,
          sourceFile: data.sourceFile,
          sourceSheet: data.sourceSheet,
          sourceType: data.sourceType,
          respondentName: data.respondentName || null,
          questionnaireResponses: data.questionnaireResponses
            ? JSON.stringify(data.questionnaireResponses)
            : null,
          riskCount: data.risks.length,
          qualityFindingCount: data.findings.length,
          risks: { create: data.risks },
          qualityFindings: { create: data.findings },
        },
      });
    });
    await log("isra-assessments", assessment.id, "ISRA Imported", null, {
      department: normalizedDepartment,
      sourceFile: data.sourceFile,
      riskCount: data.risks.length,
      qualityFindingCount: data.findings.length,
    });
    res.status(201).json({
      data: assessment,
      meta: {
        riskCount: data.risks.length,
        findingCount: data.findings.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/isra-spog/import", async (req, res, next) => {
  try {
    const data = israImportSchema.parse(req.body);
    const normalizedDepartment = data.department.replace(/\s+/g, " ").trim();
    const key = departmentKey(normalizedDepartment);
    const assessment = await prisma.$transaction(async (transaction) => {
      await ensureDepartment(transaction, normalizedDepartment);
      await transaction.israAssessment.updateMany({
        where: { departmentKey: key, isActive: true },
        data: { isActive: false },
      });
      return transaction.israAssessment.create({
        data: {
          department: normalizedDepartment,
          departmentKey: key,
          sourceFile: data.sourceFile,
          sourceSheet: data.sourceSheet,
          sourceType: data.sourceType,
          respondentName: data.respondentName || null,
          questionnaireResponses: data.questionnaireResponses
            ? JSON.stringify(data.questionnaireResponses)
            : null,
          riskCount: data.risks.length,
          qualityFindingCount: data.findings.length,
          risks: { create: data.risks },
          qualityFindings: { create: data.findings },
        },
      });
    });
    if (data.sourceType === "Daxon Questionnaire")
      await syncInformationAssetsFromDaxon(prisma);
    await log("isra-assessments", assessment.id, "ISRA Imported", null, {
      department: normalizedDepartment,
      sourceFile: data.sourceFile,
      riskCount: data.risks.length,
      qualityFindingCount: data.findings.length,
    });
    res.status(201).json({ data: assessment });
  } catch (error) {
    next(error);
  }
});

app.get("/api/isra-spog/assessments/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const selected = await prisma.israAssessment.findUnique({
      where: { id },
      select: {
        id: true,
        department: true,
        departmentKey: true,
        sourceType: true,
        respondentName: true,
        questionnaireResponses: true,
        riskCount: true,
        importedAt: true,
        isActive: true,
      },
    });
    if (!selected)
      return res.status(404).json({ error: "ISRA assessment not found" });
    if (selected.sourceType !== "Daxon Questionnaire")
      return res.status(400).json({
        error: "Only Daxon submissions can be revised in the questionnaire.",
      });
    res.json({
      data: {
        ...selected,
        questionnaireResponses: parseDaxonResponses(
          selected.questionnaireResponses,
        ),
      },
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/isra-spog/assessments/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = israImportSchema.parse(req.body);
    const previous = await prisma.israAssessment.findUnique({
      where: { id },
      include: { risks: { select: { id: true } } },
    });
    if (!previous)
      return res.status(404).json({ error: "ISRA assessment not found" });
    if (previous.sourceType !== "Daxon Questionnaire")
      return res.status(400).json({
        error: "Only Daxon submissions can be revised in the questionnaire.",
      });
    const normalizedDepartment = data.department.replace(/\s+/g, " ").trim();
    const key = departmentKey(normalizedDepartment);
    const assessment = await prisma.$transaction(async (transaction) => {
      await ensureDepartment(transaction, normalizedDepartment);
      if (previous.isActive && previous.departmentKey !== key)
        await transaction.israAssessment.updateMany({
          where: { departmentKey: key, isActive: true, id: { not: id } },
          data: { isActive: false },
        });
      if (previous.risks.length)
        await transaction.watchItem.deleteMany({
          where: {
            entityType: "isra-risks",
            entityId: { in: previous.risks.map((item) => String(item.id)) },
          },
        });
      await transaction.israRisk.deleteMany({ where: { assessmentId: id } });
      await transaction.israQualityFinding.deleteMany({
        where: { assessmentId: id },
      });
      return transaction.israAssessment.update({
        where: { id },
        data: {
          department: normalizedDepartment,
          departmentKey: key,
          sourceFile: data.sourceFile,
          sourceSheet: data.sourceSheet,
          sourceType: "Daxon Questionnaire",
          respondentName: data.respondentName || null,
          questionnaireResponses: data.questionnaireResponses
            ? JSON.stringify(data.questionnaireResponses)
            : null,
          riskCount: data.risks.length,
          qualityFindingCount: data.findings.length,
          importedAt: new Date(),
          risks: { create: data.risks },
          qualityFindings: { create: data.findings },
        },
      });
    });
    await syncInformationAssetsFromDaxon(prisma);
    await log("isra-assessments", id, "ISRA Assessment Updated", previous, {
      department: normalizedDepartment,
      sourceFile: data.sourceFile,
      riskCount: data.risks.length,
    });
    res.json({ data: assessment });
  } catch (error) {
    next(error);
  }
});

app.post("/api/isra-spog/assessments/:id/activate", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const selected = await prisma.israAssessment.findUnique({ where: { id } });
    if (!selected)
      return res.status(404).json({ error: "ISRA assessment not found" });
    await prisma.$transaction([
      prisma.israAssessment.updateMany({
        where: { departmentKey: selected.departmentKey, isActive: true },
        data: { isActive: false },
      }),
      prisma.israAssessment.update({
        where: { id },
        data: { isActive: true },
      }),
    ]);
    await syncInformationAssetsFromDaxon(prisma);
    await log("isra-assessments", id, "ISRA Version Activated", null, {
      department: selected.department,
      sourceFile: selected.sourceFile,
    });
    res.json({ data: { id, isActive: true } });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/isra-spog/assessments/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const selected = await deleteIsraAssessment(prisma, id);
    if (!selected)
      return res.status(404).json({ error: "ISRA assessment not found" });
    await syncInformationAssetsFromDaxon(prisma);
    await log("isra-assessments", id, "ISRA Assessment Deleted", selected, {
      department: selected.department,
      sourceFile: selected.sourceFile,
    });
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.put("/api/isra-spog/risks/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const previous = await prisma.israRisk.findUnique({ where: { id } });
    if (!previous)
      return res.status(404).json({ error: "ISRA risk not found" });
    const patch = israRiskUpdateSchema.parse(req.body);
    const data = Object.fromEntries(
      Object.entries(applyIsraRiskUpdate(previous, patch)).filter(
        ([, value]) => value !== undefined,
      ),
    );
    const risk = await prisma.israRisk.update({ where: { id }, data });
    await log("isra-risks", id, "ISRA Risk Updated", previous, data);
    res.json({ data: risk });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/isra-spog/risks/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const previous = await prisma.israRisk.findUnique({ where: { id } });
    if (!previous)
      return res.status(404).json({ error: "ISRA risk not found" });
    await prisma.$transaction([
      prisma.watchItem.deleteMany({
        where: { entityType: "isra-risks", entityId: String(id) },
      }),
      prisma.israRisk.delete({ where: { id } }),
      prisma.israAssessment.update({
        where: { id: previous.assessmentId },
        data: { riskCount: { decrement: 1 } },
      }),
    ]);
    await log("isra-risks", id, "ISRA Risk Deleted", previous, null);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/information-assets/sync", async (_req, res, next) => {
  try {
    const result = await syncInformationAssetsFromDaxon(prisma);
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
});

app.get("/api/information-assets", async (req, res, next) => {
  try {
    const selectedDepartment = String(req.query.department || "").trim();
    const [assets, departmentRows] = await Promise.all([
      prisma.informationAsset.findMany({
        where: selectedDepartment
          ? { departmentKey: selectedDepartment }
          : undefined,
        orderBy: [{ department: "asc" }, { assetName: "asc" }],
      }),
      listDepartmentOptions(prisma),
    ]);
    const departments = departmentRows;
    res.json({
      data: {
        scope: selectedDepartment || "all",
        departments,
        assets: assets.map((asset) => presentInformationAsset(asset)),
      },
      meta: { researchEnabled: assetResearchEnabled() },
    });
  } catch (error) {
    next(error);
  }
});

app.put("/api/information-assets/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = informationAssetUpdateSchema.parse(req.body);
    const previous = await prisma.informationAsset.findUnique({
      where: { id },
    });
    if (!previous)
      return res.status(404).json({ error: "Information asset not found" });
    const asset = await prisma.informationAsset.update({
      where: { id },
      data: presentInformationAsset(data),
    });
    await log(
      "information-assets",
      id,
      "Information Asset Updated",
      previous,
      asset,
    );
    res.json({ data: presentInformationAsset(asset) });
  } catch (error) {
    next(error);
  }
});

app.delete("/api/information-assets/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const previous = await prisma.informationAsset.findUnique({ where: { id } });
    if (!previous)
      return res.status(404).json({ error: "Information asset not found" });
    await prisma.$transaction([
      prisma.watchItem.deleteMany({
        where: { entityType: "information-assets", entityId: String(id) },
      }),
      prisma.informationAsset.delete({ where: { id } }),
    ]);
    await log(
      "information-assets",
      id,
      "Information Asset Deleted",
      previous,
      null,
    );
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.post("/api/information-assets/:id/research", async (req, res, next) => {
  try {
    if (!assetResearchEnabled())
      return res.status(403).json({ error: "Asset web research is disabled" });
    const id = Number(req.params.id);
    const asset = await prisma.informationAsset.findUnique({ where: { id } });
    if (!asset)
      return res.status(404).json({ error: "Information asset not found" });
    const models = parseResearchModels(req.body?.models);
    const internal = await loadInternalAssetResearchContext(prisma, asset);
    const research = await researchInformationAsset(
      asset.assetName,
      asset.assetType,
      { models, ...internal },
    );
    const updated = await prisma.informationAsset.update({
      where: { id },
      data: { ...research, researchUpdatedAt: new Date() },
    });
    await log("information-assets", id, "Web Research Completed", null, {
      assetName: asset.assetName,
      models,
      researchUpdatedAt: updated.researchUpdatedAt,
    });
    res.json({ data: presentInformationAsset(updated) });
  } catch (error) {
    if (error instanceof Error)
      return res.status(502).json({
        error: `Research could not be completed: ${error.message}`,
      });
    next(error);
  }
});

app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.get("/api/settings/database", async (_req, res, next) => {
  try {
    const [database, snapshots] = await Promise.all([
      databaseStatus(),
      listSnapshots(),
    ]);
    res.json({
      data: {
        ...database,
        snapshots,
        rateLimits: rateLimitControls(),
        session: {
          ttlMs: SESSION_TTL_MS,
          slideAfterMs: SESSION_SLIDE_AFTER_MS,
          absoluteTtlMs: SESSION_ABSOLUTE_TTL_MS,
          concurrent: false,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});
app.post("/api/settings/backup", async (_req, res, next) => {
  try {
    await checkpointSqlite(prisma);
    const snapshot = await createSnapshot();
    await log("settings", snapshot.fileName, "Database Backup Created", null, {
      fileName: snapshot.fileName,
      sizeBytes: snapshot.sizeBytes,
    });
    res.status(201).json({ data: snapshot });
  } catch (error) {
    next(error);
  }
});
app.get("/api/settings/backup/:fileName", async (req, res, next) => {
  try {
    const filePath = await snapshotPath(req.params.fileName);
    res.download(filePath, req.params.fileName);
  } catch (error) {
    next(error);
  }
});
app.post("/api/settings/restore", async (req, res, next) => {
  try {
    const user = currentUser(res);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const parsed = z
      .object({
        fileName: z.string().trim().min(1),
        password: z.string().min(1).max(200),
      })
      .parse(req.body);
    const confirmed = await verifyCurrentPassword(
      prisma,
      user.id,
      parsed.password,
    );
    if (!confirmed)
      return res.status(401).json({ error: "Password confirmation failed" });
    const filePath = await snapshotPath(parsed.fileName);
    await checkpointSqlite(prisma);
    await createSnapshot();
    await prisma.$disconnect();
    await replaceDatabase(filePath);
    await log("settings", parsed.fileName, "Database Restored", null, {
      fileName: parsed.fileName,
    });
    res.json({ data: { restored: parsed.fileName } });
  } catch (error) {
    next(error);
  }
});
app.post("/api/settings/restore-upload", async (req, res, next) => {
  try {
    const user = currentUser(res);
    if (!user) return res.status(401).json({ error: "Authentication required" });
    const confirmed = await verifyCurrentPassword(
      prisma,
      user.id,
      String(req.headers["x-confirm-password"] || ""),
    );
    if (!confirmed)
      return res.status(401).json({ error: "Password confirmation failed" });
    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    if (!buffer.length)
      return res.status(400).json({ error: "Backup file is required" });
    await checkpointSqlite(prisma);
    await createSnapshot();
    await prisma.$disconnect();
    await writeUploadedDatabase(buffer);
    await log("settings", "upload", "Database Restored From Upload");
    res.json({ data: { restored: "uploaded file" } });
  } catch (error) {
    next(error);
  }
});
registerSpaRoutes(app);
app.use((err: any, _req: any, res: any, _next: any) => {
  if (err instanceof z.ZodError)
    return res
      .status(400)
      .json({ error: "Validation failed", details: err.flatten() });
  if (err?.code === "P2002")
    return res
      .status(409)
      .json({ error: "A record with that identifier already exists" });
  const known = clientErrorMessage(err);
  if (known) return res.status(400).json({ error: known });
  writeAppLog("error", "unhandled_error", {
    message: err?.message || "Internal server error",
  });
  res.status(500).json({ error: "Internal server error" });
});
export default app;
