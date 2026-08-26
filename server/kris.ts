import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import type { Express } from "express";
import { z } from "zod";
import { currentUser, FORBIDDEN, userHasPage, type AuthUser } from "./auth.js";
import type { LogFn } from "./activityLog.js";

export const KRI_MONTHS = [
  ["jan", "January"],
  ["feb", "February"],
  ["mar", "March"],
  ["apr", "April"],
  ["may", "May"],
  ["jun", "June"],
  ["jul", "July"],
  ["aug", "August"],
  ["sep", "September"],
  ["oct", "October"],
  ["nov", "November"],
  ["dec", "December"],
] as const;

export const KRI_RESULTS = ["Good", "Warning", "Breached"] as const;

const opt = z.string().trim().max(20000).nullish();
const result = z
  .string()
  .trim()
  .nullish()
  .transform((value) => {
    const next = value || null;
    if (!next) return null;
    return next;
  });

const monthFields = Object.fromEntries(
  KRI_MONTHS.flatMap(([key]) => [
    [`${key}Result`, result],
    [`${key}Remarks`, opt],
  ]),
) as Record<string, z.ZodTypeAny>;

export const kriRecordSchema = z
  .object({
    sheetId: z.number().int().optional(),
    year: z.number().int().min(2000).max(2100).optional(),
    sortOrder: z.number().int().optional(),
    riskCode: opt,
    riskName: z.string().trim().min(1).max(400),
    kriNumber: z.string().trim().min(1).max(40),
    keyRiskIndicator: z.string().trim().min(1),
    weight: z.number().min(0).max(1).nullish(),
    breached: opt,
    warning: opt,
    good: opt,
    ...monthFields,
  })
  .strip();

const rolloverSchema = z
  .object({
    fromYear: z.number().int().min(2000).max(2100),
    toYear: z.number().int().min(2000).max(2100).optional(),
  })
  .strip();

const kriMapSchema = z
  .object({
    kriRecordId: z.number().int(),
    orcaRiskIds: z.array(z.number().int()).max(200),
  })
  .strip();

const orcaMapSchema = z
  .object({
    orcaRiskId: z.number().int(),
    kriRecordIds: z.array(z.number().int()).max(200),
    year: z.number().int().min(2000).max(2100).optional(),
  })
  .strip();

type SeedRow = {
  sortOrder: number;
  riskCode: string;
  riskName: string;
  kriNumber: string;
  keyRiskIndicator: string;
  weight: number | null;
  breached: string;
  warning: string;
  good: string;
  [key: string]: unknown;
};

function blankToNull(value: unknown) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function loadKriSeedRows(): SeedRow[] {
  const seedPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "kriSeed.json",
  );
  return JSON.parse(readFileSync(seedPath, "utf8")) as SeedRow[];
}

function monthPayload(row: SeedRow) {
  const data: Record<string, string | null> = {};
  for (const [key] of KRI_MONTHS) {
    data[`${key}Result`] = blankToNull(row[`${key}Result`]);
    data[`${key}Remarks`] = blankToNull(row[`${key}Remarks`]);
  }
  return data;
}

export async function ensureKriSeed(prisma: PrismaClient) {
  const existing = await prisma.kriSheet.count();
  if (existing > 0) return existing;
  const rows = loadKriSeedRows();
  const sheet = await prisma.kriSheet.create({
    data: { year: 2026, status: "Active" },
  });
  for (const row of rows) {
    await prisma.kriRecord.create({
      data: {
        sheetId: sheet.id,
        sortOrder: row.sortOrder,
        riskCode: blankToNull(row.riskCode),
        riskName: row.riskName,
        kriNumber: row.kriNumber,
        keyRiskIndicator: row.keyRiskIndicator,
        weight: row.weight,
        breached: blankToNull(row.breached),
        warning: blankToNull(row.warning),
        good: blankToNull(row.good),
        ...monthPayload(row),
      },
    });
  }
  return rows.length;
}

export async function rolloverKriSheet(
  prisma: PrismaClient,
  fromYear: number,
  toYear: number,
) {
  if (toYear === fromYear) {
    throw new Error("Choose a different year for the new KRI sheet.");
  }
  const source = await prisma.kriSheet.findUnique({
    where: { year: fromYear },
    include: {
      records: { include: { mappings: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  if (!source) throw new Error(`No KRI sheet exists for ${fromYear}.`);
  if (source.status !== "Active") {
    throw new Error(`${fromYear} is already archived.`);
  }
  const clash = await prisma.kriSheet.findUnique({ where: { year: toYear } });
  if (clash) throw new Error(`A KRI sheet for ${toYear} already exists.`);

  return prisma.$transaction(async (tx) => {
    await tx.kriSheet.update({
      where: { id: source.id },
      data: { status: "Archived", archivedAt: new Date() },
    });
    const next = await tx.kriSheet.create({
      data: { year: toYear, status: "Active" },
    });
    for (const record of source.records) {
      const created = await tx.kriRecord.create({
        data: {
          sheetId: next.id,
          sortOrder: record.sortOrder,
          riskCode: record.riskCode,
          riskName: record.riskName,
          kriNumber: record.kriNumber,
          keyRiskIndicator: record.keyRiskIndicator,
          weight: record.weight,
          breached: record.breached,
          warning: record.warning,
          good: record.good,
        },
      });
      if (record.mappings.length) {
        await tx.kriOrcaMap.createMany({
          data: record.mappings.map((item) => ({
            kriRecordId: created.id,
            orcaRiskId: item.orcaRiskId,
          })),
        });
      }
    }
    return next;
  });
}

function serializeRecord(record: any) {
  return {
    ...record,
    year: record.sheet?.year,
    sheetStatus: record.sheet?.status,
    orcaRiskIds: (record.mappings || []).map((item: any) => item.orcaRiskId),
    orcaRisks: (record.mappings || [])
      .map((item: any) => item.orcaRisk)
      .filter(Boolean),
  };
}

function canMap(user: AuthUser) {
  return (
    user.role === "Admin" ||
    userHasPage(user, "kris") ||
    userHasPage(user, "orca")
  );
}

export function registerKriRoutes(
  app: Express,
  prisma: PrismaClient,
  log: LogFn,
) {
  app.get("/api/kri-sheets", async (_req, res, next) => {
    try {
      const sheets = await prisma.kriSheet.findMany({
        orderBy: { year: "desc" },
        include: { _count: { select: { records: true } } },
      });
      res.json({
        data: sheets.map((sheet) => ({
          ...sheet,
          recordCount: sheet._count.records,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/kri-records", async (req, res, next) => {
    try {
      const year = Number(req.query.year) || undefined;
      const archived = req.query.archived === "true";
      const search = String(req.query.search || "").trim();
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
      const where: any = { archivedAt: archived ? { not: null } : null };
      if (year) where.sheet = { year };
      for (const [key, value] of Object.entries(req.query)) {
        if (key.startsWith("filter.") && value) where[key.slice(7)] = String(value);
      }
      if (search) {
        where.OR = [
          { riskName: { contains: search } },
          { riskCode: { contains: search } },
          { kriNumber: { contains: search } },
          { keyRiskIndicator: { contains: search } },
        ];
      }
      const [records, total] = await Promise.all([
        prisma.kriRecord.findMany({
          where,
          include: {
            sheet: true,
            mappings: { include: { orcaRisk: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.kriRecord.count({ where }),
      ]);
      res.json({
        data: records.map(serializeRecord),
        meta: {
          page,
          pageSize,
          total,
          totalPages: Math.max(1, Math.ceil(total / pageSize)),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kri-records", async (req, res, next) => {
    try {
      const data = kriRecordSchema.parse(req.body);
      let sheetId = data.sheetId;
      if (!sheetId) {
        const year = data.year;
        const sheet = year
          ? await prisma.kriSheet.findUnique({ where: { year } })
          : await prisma.kriSheet.findFirst({
              where: { status: "Active" },
              orderBy: { year: "desc" },
            });
        if (!sheet) return res.status(400).json({ error: "No active KRI sheet." });
        sheetId = sheet.id;
      }
      const { year: _year, ...fields } = data;
      const row = await prisma.kriRecord.create({
        data: { ...fields, sheetId },
        include: { sheet: true, mappings: { include: { orcaRisk: true } } },
      });
      await log("kri-records", row.id, "Created", null, data);
      res.status(201).json({ data: serializeRecord(row) });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/kri-records/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const prev = await prisma.kriRecord.findUnique({ where: { id } });
      if (!prev) return res.status(404).json({ error: "KRI not found" });
      const data = kriRecordSchema.partial().parse(req.body);
      const { year: _year, sheetId: _sheetId, ...fields } = data;
      const row = await prisma.kriRecord.update({
        where: { id },
        data: fields,
        include: { sheet: true, mappings: { include: { orcaRisk: true } } },
      });
      await log("kri-records", id, "Edited", prev, fields);
      res.json({ data: serializeRecord(row) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kri-records/:id/archive", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await prisma.kriRecord.update({
        where: { id },
        data: { archivedAt: new Date() },
      });
      await log("kri-records", id, "Archived");
      res.json({ data: row });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kri-records/:id/restore", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await prisma.kriRecord.update({
        where: { id },
        data: { archivedAt: null },
      });
      await log("kri-records", id, "Restored");
      res.json({ data: row });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/kri-sheets/rollover", async (req, res, next) => {
    try {
      const data = rolloverSchema.parse(req.body);
      const toYear = data.toYear ?? data.fromYear + 1;
      const sheet = await rolloverKriSheet(prisma, data.fromYear, toYear);
      await log("kri-sheets", sheet.id, "Year Archived and Renewed", null, {
        fromYear: data.fromYear,
        toYear,
      });
      res.status(201).json({ data: sheet });
    } catch (error) {
      if (error instanceof Error && /KRI sheet|already|different year/.test(error.message)) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  app.get("/api/kri-mappings", async (_req, res, next) => {
    try {
      const user = currentUser(res);
      if (!user) return res.status(401).json({ error: "Authentication required" });
      if (!canMap(user)) return res.status(403).json({ error: FORBIDDEN });
      const [sheets, kris, orcaRisks] = await Promise.all([
        prisma.kriSheet.findMany({ orderBy: { year: "desc" } }),
        prisma.kriRecord.findMany({
          where: { archivedAt: null },
          include: {
            sheet: true,
            mappings: { include: { orcaRisk: true } },
          },
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        }),
        prisma.orcaRisk.findMany({
          where: { archivedAt: null },
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            riskNo: true,
            processNo: true,
            process: true,
            riskThreat: true,
          },
        }),
      ]);
      res.json({
        data: {
          sheets,
          kris: kris.map(serializeRecord),
          orcaRisks,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/kri-mappings", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (!user) return res.status(401).json({ error: "Authentication required" });
      if (!canMap(user)) return res.status(403).json({ error: FORBIDDEN });
      if (req.body?.orcaRiskId != null && req.body?.kriRecordId == null) {
        const data = orcaMapSchema.parse(req.body);
        const orca = await prisma.orcaRisk.findUnique({
          where: { id: data.orcaRiskId },
        });
        if (!orca) return res.status(404).json({ error: "ORCA risk not found" });
        const yearKris = await prisma.kriRecord.findMany({
          where: data.year
            ? { sheet: { year: data.year } }
            : { sheet: { status: "Active" } },
          select: { id: true },
        });
        const yearIds = new Set(yearKris.map((item) => item.id));
        await prisma.$transaction(async (tx) => {
          await tx.kriOrcaMap.deleteMany({
            where: {
              orcaRiskId: data.orcaRiskId,
              kriRecordId: { in: [...yearIds] },
            },
          });
          const keep = data.kriRecordIds.filter((id) => yearIds.has(id));
          if (keep.length) {
            await tx.kriOrcaMap.createMany({
              data: keep.map((kriRecordId) => ({
                kriRecordId,
                orcaRiskId: data.orcaRiskId,
              })),
            });
          }
        });
        await log("kri-mappings", data.orcaRiskId, "ORCA Mapping Updated", null, data);
        return res.json({ data: { orcaRiskId: data.orcaRiskId, kriRecordIds: data.kriRecordIds } });
      }
      const data = kriMapSchema.parse(req.body);
      const kri = await prisma.kriRecord.findUnique({
        where: { id: data.kriRecordId },
      });
      if (!kri) return res.status(404).json({ error: "KRI not found" });
      await prisma.$transaction(async (tx) => {
        await tx.kriOrcaMap.deleteMany({ where: { kriRecordId: data.kriRecordId } });
        if (data.orcaRiskIds.length) {
          await tx.kriOrcaMap.createMany({
            data: data.orcaRiskIds.map((orcaRiskId) => ({
              kriRecordId: data.kriRecordId,
              orcaRiskId,
            })),
          });
        }
      });
      await log("kri-mappings", data.kriRecordId, "KRI Mapping Updated", null, data);
      res.json({ data: { kriRecordId: data.kriRecordId, orcaRiskIds: data.orcaRiskIds } });
    } catch (error) {
      next(error);
    }
  });
}
