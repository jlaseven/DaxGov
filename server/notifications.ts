import type { PrismaClient } from "@prisma/client";
import { differenceInCalendarDays } from "date-fns";
import type { Express } from "express";
import { z } from "zod";
import { currentUser, FORBIDDEN, userHasPage, type AuthUser } from "./auth.js";
import {
  auditMetrics,
  derivedStatus,
  effectiveDate,
  objectiveProgress,
  tcdStatus,
} from "./calculations.js";
import { israActionDueStatus } from "./isra.js";

export const WATCHABLE_TYPES = [
  "documents",
  "opir-actions",
  "audit-findings",
  "objectives",
  "initiatives",
  "tpsa-records",
  "isra-risks",
  "information-assets",
  "orca",
  "kri-records",
] as const;

export type WatchableType = (typeof WATCHABLE_TYPES)[number];

export type NoticeFlag =
  | "important"
  | "overdue"
  | "due-soon"
  | "high-risk"
  | "at-risk"
  | "attention";

export type Notice = {
  key: string;
  entityType: WatchableType;
  entityId: string;
  title: string;
  detail: string;
  href: string;
  flags: NoticeFlag[];
  severity: "high" | "medium" | "low";
  dueDate: string | null;
};

const PAGE_BY_TYPE: Record<WatchableType, string> = {
  documents: "documents",
  "opir-actions": "opir-actions",
  "audit-findings": "audit-findings",
  objectives: "objectives",
  initiatives: "initiatives",
  "tpsa-records": "tpsa-monitoring",
  "isra-risks": "isra",
  "information-assets": "information-assets",
  orca: "orca",
  "kri-records": "kris",
};

const HREF_BY_TYPE: Record<WatchableType, string> = {
  documents: "/documents",
  "opir-actions": "/opir-actions",
  "audit-findings": "/audit-findings",
  objectives: "/objectives",
  initiatives: "/initiatives",
  "tpsa-records": "/tpsa-monitoring",
  "isra-risks": "/isra",
  "information-assets": "/information-assets",
  orca: "/orca",
  "kri-records": "/kris",
};

export function isWatchableType(value: string): value is WatchableType {
  return (WATCHABLE_TYPES as readonly string[]).includes(value);
}

export function pageForWatchType(type: WatchableType) {
  return PAGE_BY_TYPE[type];
}

function iso(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function daysUntil(value?: Date | string | null, now = new Date()) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return differenceInCalendarDays(date, now);
}

function highRisk(value?: string | null) {
  return value === "Critical" || value === "High";
}

function severityFor(flags: NoticeFlag[]): Notice["severity"] {
  if (
    flags.includes("overdue") ||
    flags.includes("high-risk") ||
    flags.includes("attention")
  )
    return "high";
  if (flags.includes("due-soon") || flags.includes("at-risk")) return "medium";
  return "low";
}

function upsert(
  map: Map<string, Notice>,
  partial: Omit<Notice, "flags" | "severity" | "key"> & {
    flags: NoticeFlag[];
  },
) {
  const key = `${partial.entityType}:${partial.entityId}`;
  const existing = map.get(key);
  const flags = [
    ...new Set([...(existing?.flags || []), ...partial.flags]),
  ] as NoticeFlag[];
  map.set(key, {
    key,
    entityType: partial.entityType,
    entityId: partial.entityId,
    title: partial.title || existing?.title || key,
    detail: [existing?.detail, partial.detail].filter(Boolean).join(" · "),
    href: partial.href,
    flags,
    severity: severityFor(flags),
    dueDate: partial.dueDate || existing?.dueDate || null,
  });
}

export type NotificationSource = {
  watched: { entityType: string; entityId: string }[];
  documents: { id: number; documentName: string; status: string }[];
  opir: {
    id: number;
    opirNumber: string;
    incidentTitle: string;
    riskRating: string;
    actionStatus: string;
    originalTargetDate?: Date | null;
    updatedTargetDate?: Date | null;
  }[];
  audits: {
    id: number;
    findingNumber: string;
    auditObservation: string;
    riskLevel: string;
    findingStatus: string;
    originalTargetDate?: Date | null;
    updatedTargetDate?: Date | null;
  }[];
  objectives: {
    id: number;
    objectiveId: string;
    objectiveName: string;
    endDate?: Date | null;
    tasks: { taskStatus: string; archivedAt?: Date | null }[];
  }[];
  initiatives: {
    id: number;
    initiativeName: string;
    status: string;
    manualOverride?: boolean;
    endDate?: Date | null;
    subInitiatives: { status: string; archivedAt?: Date | null }[];
  }[];
  tpsa: {
    id: number;
    tpsaReference: string;
    vendorName: string;
    submittedDate?: Date | null;
    submissionDeadline?: Date | null;
    openCriticalFindings?: number;
    openHighFindings?: number;
  }[];
  israRisks: {
    id: number;
    riskReference?: string | null;
    description?: string | null;
    inherentRating: string;
    commitmentDate?: Date | null;
  }[];
  assets: {
    id: number;
    assetName: string;
    riskLevel?: string | null;
  }[];
  orca: {
    id: number;
    riskNo: string;
    riskThreat: string;
    inherentRiskScore?: number | null;
    targetCompletionDate?: Date | null;
    status?: string | null;
  }[];
  kris: {
    id: number;
    riskName: string;
    kriNumber: string;
    keyRiskIndicator: string;
    janResult?: string | null;
    febResult?: string | null;
    marResult?: string | null;
    aprResult?: string | null;
    mayResult?: string | null;
    junResult?: string | null;
    julResult?: string | null;
    augResult?: string | null;
    sepResult?: string | null;
    octResult?: string | null;
    novResult?: string | null;
    decResult?: string | null;
  }[];
};

export function buildNotifications(
  source: NotificationSource,
  now = new Date(),
): Notice[] {
  const map = new Map<string, Notice>();
  const watched = new Set(
    source.watched.map((item) => `${item.entityType}:${item.entityId}`),
  );

  const markImportant = (
    type: WatchableType,
    id: number | string,
    title: string,
    href = HREF_BY_TYPE[type],
  ) => {
    if (!watched.has(`${type}:${id}`)) return;
    upsert(map, {
      entityType: type,
      entityId: String(id),
      title,
      detail: "Marked important",
      href,
      flags: ["important"],
      dueDate: null,
    });
  };

  for (const doc of source.documents) {
    markImportant("documents", doc.id, doc.documentName);
    if (doc.status === "Outdated" || doc.status === "Non-existent") {
      upsert(map, {
        entityType: "documents",
        entityId: String(doc.id),
        title: doc.documentName,
        detail: doc.status,
        href: HREF_BY_TYPE.documents,
        flags: ["attention"],
        dueDate: null,
      });
    }
  }

  for (const item of source.opir) {
    markImportant(
      "opir-actions",
      item.id,
      `${item.opirNumber} · ${item.incidentTitle}`,
    );
    const status = tcdStatus(item, now);
    const due = effectiveDate(item);
    if (item.actionStatus !== "Completed" && item.actionStatus !== "Cancelled") {
      if (status === "Overdue")
        upsert(map, {
          entityType: "opir-actions",
          entityId: String(item.id),
          title: item.opirNumber,
          detail: "OPIR overdue",
          href: HREF_BY_TYPE["opir-actions"],
          flags: ["overdue"],
          dueDate: iso(due),
        });
      if (status === "Due Soon")
        upsert(map, {
          entityType: "opir-actions",
          entityId: String(item.id),
          title: item.opirNumber,
          detail: "OPIR due within 7 days",
          href: HREF_BY_TYPE["opir-actions"],
          flags: ["due-soon"],
          dueDate: iso(due),
        });
      if (highRisk(item.riskRating))
        upsert(map, {
          entityType: "opir-actions",
          entityId: String(item.id),
          title: item.opirNumber,
          detail: `${item.riskRating} risk`,
          href: HREF_BY_TYPE["opir-actions"],
          flags: ["high-risk"],
          dueDate: iso(due),
        });
    }
  }

  for (const item of source.audits) {
    markImportant(
      "audit-findings",
      item.id,
      `${item.findingNumber} · ${item.auditObservation}`,
    );
    const metrics = auditMetrics(item, now);
    const due = effectiveDate(item);
    if (item.findingStatus !== "Closed") {
      if (metrics.overdueStatus === "Overdue")
        upsert(map, {
          entityType: "audit-findings",
          entityId: String(item.id),
          title: item.findingNumber,
          detail: "Audit finding overdue",
          href: HREF_BY_TYPE["audit-findings"],
          flags: ["overdue"],
          dueDate: iso(due),
        });
      if (metrics.overdueStatus === "Due Soon")
        upsert(map, {
          entityType: "audit-findings",
          entityId: String(item.id),
          title: item.findingNumber,
          detail: "Audit finding due within 7 days",
          href: HREF_BY_TYPE["audit-findings"],
          flags: ["due-soon"],
          dueDate: iso(due),
        });
      if (highRisk(item.riskLevel))
        upsert(map, {
          entityType: "audit-findings",
          entityId: String(item.id),
          title: item.findingNumber,
          detail: `${item.riskLevel} risk`,
          href: HREF_BY_TYPE["audit-findings"],
          flags: ["high-risk"],
          dueDate: iso(due),
        });
    }
  }

  for (const item of source.objectives) {
    markImportant(
      "objectives",
      item.id,
      `${item.objectiveId} · ${item.objectiveName}`,
    );
    const progress = objectiveProgress(item.tasks);
    const dueIn = daysUntil(item.endDate, now);
    if (progress.status !== "Done" && progress.status !== "Deferred") {
      if (dueIn !== null && dueIn < 0)
        upsert(map, {
          entityType: "objectives",
          entityId: String(item.id),
          title: item.objectiveName,
          detail: "OKR end date overdue",
          href: HREF_BY_TYPE.objectives,
          flags: ["overdue"],
          dueDate: iso(item.endDate),
        });
      if (dueIn !== null && dueIn >= 0 && dueIn <= 14)
        upsert(map, {
          entityType: "objectives",
          entityId: String(item.id),
          title: item.objectiveName,
          detail: "OKR due within 14 days",
          href: HREF_BY_TYPE.objectives,
          flags: ["due-soon"],
          dueDate: iso(item.endDate),
        });
      if (progress.status === "In Progress – At Risk")
        upsert(map, {
          entityType: "objectives",
          entityId: String(item.id),
          title: item.objectiveName,
          detail: "OKR at risk",
          href: HREF_BY_TYPE.objectives,
          flags: ["at-risk"],
          dueDate: iso(item.endDate),
        });
    }
  }

  for (const item of source.initiatives) {
    markImportant("initiatives", item.id, item.initiativeName);
    const status = item.manualOverride
      ? item.status
      : derivedStatus(item.subInitiatives, item.status);
    const dueIn = daysUntil(item.endDate, now);
    if (status !== "Done" && status !== "Deferred") {
      if (dueIn !== null && dueIn < 0)
        upsert(map, {
          entityType: "initiatives",
          entityId: String(item.id),
          title: item.initiativeName,
          detail: "Initiative end date overdue",
          href: HREF_BY_TYPE.initiatives,
          flags: ["overdue"],
          dueDate: iso(item.endDate),
        });
      if (dueIn !== null && dueIn >= 0 && dueIn <= 14)
        upsert(map, {
          entityType: "initiatives",
          entityId: String(item.id),
          title: item.initiativeName,
          detail: "Initiative due within 14 days",
          href: HREF_BY_TYPE.initiatives,
          flags: ["due-soon"],
          dueDate: iso(item.endDate),
        });
      if (status === "In Progress – At Risk")
        upsert(map, {
          entityType: "initiatives",
          entityId: String(item.id),
          title: item.initiativeName,
          detail: "Calculated status at risk",
          href: HREF_BY_TYPE.initiatives,
          flags: ["at-risk"],
          dueDate: iso(item.endDate),
        });
    }
  }

  for (const item of source.tpsa) {
    markImportant(
      "tpsa-records",
      item.id,
      `${item.tpsaReference} · ${item.vendorName}`,
    );
    const dueIn = item.submittedDate
      ? null
      : daysUntil(item.submissionDeadline, now);
    if (dueIn !== null && dueIn < 0)
      upsert(map, {
        entityType: "tpsa-records",
        entityId: String(item.id),
        title: item.tpsaReference,
        detail: "Vendor submission overdue",
        href: HREF_BY_TYPE["tpsa-records"],
        flags: ["overdue"],
        dueDate: iso(item.submissionDeadline),
      });
    if (dueIn !== null && dueIn >= 0 && dueIn <= 7)
      upsert(map, {
        entityType: "tpsa-records",
        entityId: String(item.id),
        title: item.tpsaReference,
        detail: "Submission due within 7 days",
        href: HREF_BY_TYPE["tpsa-records"],
        flags: ["due-soon"],
        dueDate: iso(item.submissionDeadline),
      });
    if ((item.openCriticalFindings || 0) > 0 || (item.openHighFindings || 0) > 0)
      upsert(map, {
        entityType: "tpsa-records",
        entityId: String(item.id),
        title: item.tpsaReference,
        detail: "Open critical or high findings",
        href: HREF_BY_TYPE["tpsa-records"],
        flags: ["high-risk"],
        dueDate: iso(item.submissionDeadline),
      });
  }

  for (const item of source.israRisks) {
    const title = item.riskReference || item.description || `ISRA risk #${item.id}`;
    markImportant("isra-risks", item.id, title);
    const due = israActionDueStatus(item, now);
    if (due === "Overdue")
      upsert(map, {
        entityType: "isra-risks",
        entityId: String(item.id),
        title,
        detail: "ISRA action overdue",
        href: HREF_BY_TYPE["isra-risks"],
        flags: ["overdue"],
        dueDate: iso(item.commitmentDate),
      });
    if (due === "Due ≤30 days")
      upsert(map, {
        entityType: "isra-risks",
        entityId: String(item.id),
        title,
        detail: "ISRA action due within 30 days",
        href: HREF_BY_TYPE["isra-risks"],
        flags: ["due-soon"],
        dueDate: iso(item.commitmentDate),
      });
    if (highRisk(item.inherentRating))
      upsert(map, {
        entityType: "isra-risks",
        entityId: String(item.id),
        title,
        detail: `${item.inherentRating} inherent risk`,
        href: HREF_BY_TYPE["isra-risks"],
        flags: ["high-risk"],
        dueDate: iso(item.commitmentDate),
      });
  }

  for (const item of source.assets) {
    markImportant("information-assets", item.id, item.assetName);
    if (highRisk(item.riskLevel))
      upsert(map, {
        entityType: "information-assets",
        entityId: String(item.id),
        title: item.assetName,
        detail: `${item.riskLevel} information asset`,
        href: HREF_BY_TYPE["information-assets"],
        flags: ["high-risk"],
        dueDate: null,
      });
  }

  for (const item of source.orca) {
    markImportant("orca", item.id, `${item.riskNo} · ${item.riskThreat}`);
    const due = daysUntil(item.targetCompletionDate, now);
    const open = item.status !== "Closed";
    if (open && due != null && due < 0)
      upsert(map, {
        entityType: "orca",
        entityId: String(item.id),
        title: item.riskNo,
        detail: "ORCA action overdue",
        href: HREF_BY_TYPE.orca,
        flags: ["overdue"],
        dueDate: iso(item.targetCompletionDate),
      });
    if (open && due != null && due >= 0 && due <= 30)
      upsert(map, {
        entityType: "orca",
        entityId: String(item.id),
        title: item.riskNo,
        detail: "ORCA action due within 30 days",
        href: HREF_BY_TYPE.orca,
        flags: ["due-soon"],
        dueDate: iso(item.targetCompletionDate),
      });
    if ((item.inherentRiskScore || 0) >= 20)
      upsert(map, {
        entityType: "orca",
        entityId: String(item.id),
        title: item.riskNo,
        detail: `Inherent score ${item.inherentRiskScore}`,
        href: HREF_BY_TYPE.orca,
        flags: ["high-risk"],
        dueDate: iso(item.targetCompletionDate),
      });
  }

  for (const item of source.kris) {
    const title = `${item.kriNumber} · ${item.keyRiskIndicator}`;
    markImportant("kri-records", item.id, title);
    const months = [
      item.janResult,
      item.febResult,
      item.marResult,
      item.aprResult,
      item.mayResult,
      item.junResult,
      item.julResult,
      item.augResult,
      item.sepResult,
      item.octResult,
      item.novResult,
      item.decResult,
    ];
    if (months.includes("Breached"))
      upsert(map, {
        entityType: "kri-records",
        entityId: String(item.id),
        title,
        detail: "KRI breached",
        href: HREF_BY_TYPE["kri-records"],
        flags: ["attention"],
        dueDate: null,
      });
  }

  return [...map.values()].sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 };
    if (rank[a.severity] !== rank[b.severity])
      return rank[a.severity] - rank[b.severity];
    return (a.dueDate || "").localeCompare(b.dueDate || "");
  });
}

const watchBody = z
  .object({
    entityType: z.string().refine(isWatchableType, "Unknown record type"),
    entityId: z
      .union([z.string(), z.number()])
      .transform((value) => String(value).trim())
      .refine((value) => value.length > 0 && value.length < 80, "Invalid id"),
  })
  .strip();

function canSeeType(user: AuthUser, type: WatchableType) {
  return user.role === "Admin" || userHasPage(user, pageForWatchType(type));
}

async function loadSource(prisma: PrismaClient, userId: number) {
  const [
    watched,
    documents,
    opir,
    audits,
    objectives,
    initiatives,
    tpsa,
    israRisks,
    assets,
    orca,
    kris,
  ] = await Promise.all([
    prisma.watchItem.findMany({
      where: { userId },
      select: { entityType: true, entityId: true },
    }),
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
    prisma.tpsaRecord.findMany({ where: { archivedAt: null } }),
    prisma.israRisk.findMany({
      where: { assessment: { isActive: true } },
    }),
    prisma.informationAsset.findMany(),
    prisma.orcaRisk.findMany({ where: { archivedAt: null } }),
    prisma.kriRecord.findMany({
      where: { archivedAt: null, sheet: { status: "Active" } },
    }),
  ]);
  return {
    watched,
    documents,
    opir,
    audits,
    objectives,
    initiatives,
    tpsa,
    israRisks,
    assets,
    orca,
    kris,
  };
}

function noticesForUser(source: NotificationSource, user: AuthUser) {
  return buildNotifications(source).filter((notice) =>
    canSeeType(user, notice.entityType),
  );
}

export function registerNotificationRoutes(app: Express, prisma: PrismaClient) {
  app.get("/api/watchlist", async (_req, res, next) => {
    try {
      const user = currentUser(res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      const items = await prisma.watchItem.findMany({
        where: { userId: user.id },
        select: { entityType: true, entityId: true },
      });
      res.json({
        data: items.filter((item) => isWatchableType(item.entityType)),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/watchlist", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      const data = watchBody.parse(req.body);
      if (!canSeeType(user, data.entityType))
        return res.status(403).json({ error: FORBIDDEN });
      const item = await prisma.watchItem.upsert({
        where: {
          userId_entityType_entityId: {
            userId: user.id,
            entityType: data.entityType,
            entityId: data.entityId,
          },
        },
        update: {},
        create: {
          userId: user.id,
          entityType: data.entityType,
          entityId: data.entityId,
        },
      });
      res.json({
        data: { entityType: item.entityType, entityId: item.entityId },
      });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/watchlist/:entityType/:entityId", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      if (!isWatchableType(req.params.entityType))
        return res.status(400).json({ error: "Unknown record type" });
      await prisma.watchItem.deleteMany({
        where: {
          userId: user.id,
          entityType: req.params.entityType,
          entityId: String(req.params.entityId),
        },
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/notifications", async (_req, res, next) => {
    try {
      const user = currentUser(res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      const [source, reads] = await Promise.all([
        loadSource(prisma, user.id),
        prisma.notificationRead.findMany({
          where: { userId: user.id },
          select: { noticeKey: true },
        }),
      ]);
      const readKeys = new Set(reads.map((row) => row.noticeKey));
      const data = noticesForUser(source, user).map((notice) => ({
        ...notice,
        unread: !readKeys.has(notice.key),
      }));
      res.json({
        data,
        meta: { unread: data.filter((item) => item.unread).length },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/notifications/read", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      const body = z
        .object({
          keys: z.array(z.string().min(1).max(200)).optional(),
          all: z.boolean().optional(),
        })
        .strip()
        .parse(req.body || {});
      let keys = body.keys || [];
      if (body.all) {
        const source = await loadSource(prisma, user.id);
        keys = noticesForUser(source, user).map((notice) => notice.key);
      }
      await Promise.all(
        keys.map((noticeKey) =>
          prisma.notificationRead.upsert({
            where: {
              userId_noticeKey: { userId: user.id, noticeKey },
            },
            update: { readAt: new Date() },
            create: { userId: user.id, noticeKey },
          }),
        ),
      );
      res.json({ data: { read: keys.length } });
    } catch (error) {
      next(error);
    }
  });
}
