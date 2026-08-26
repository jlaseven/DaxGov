import type { PrismaClient } from "@prisma/client";
import type { Express } from "express";
import { actorName, currentUser } from "./auth.js";
import {
  departmentBodySchema,
  departmentKey,
  normalizeDepartmentName,
} from "./isra.js";
import type { LogFn } from "./activityLog.js";

type Db = PrismaClient | any;

export async function ensureDepartment(prisma: Db, name: string) {
  const normalized = normalizeDepartmentName(name);
  const key = departmentKey(normalized);
  return prisma.department.upsert({
    where: { departmentKey: key },
    update: {},
    create: { name: normalized, departmentKey: key },
  });
}

export async function listDepartmentOptions(prisma: PrismaClient) {
  const [catalog, assessments, assets] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.israAssessment.findMany({
      select: { department: true, departmentKey: true },
    }),
    prisma.informationAsset.findMany({
      select: { department: true, departmentKey: true },
    }),
  ]);
  const map = new Map<
    string,
    { id: number | null; department: string; departmentKey: string }
  >();
  for (const row of catalog)
    map.set(row.departmentKey, {
      id: row.id,
      department: row.name,
      departmentKey: row.departmentKey,
    });
  for (const row of [...assessments, ...assets]) {
    if (map.has(row.departmentKey)) continue;
    map.set(row.departmentKey, {
      id: null,
      department: row.department,
      departmentKey: row.departmentKey,
    });
  }
  return [...map.values()].sort((a, b) =>
    a.department.localeCompare(b.department),
  );
}

async function cleanupWatchItems(
  prisma: Db,
  entityType: string,
  ids: Array<number | string>,
) {
  if (!ids.length) return;
  await prisma.watchItem.deleteMany({
    where: {
      entityType,
      entityId: { in: ids.map(String) },
    },
  });
}

export async function deleteIsraAssessment(
  prisma: PrismaClient,
  id: number,
) {
  const selected = await prisma.israAssessment.findUnique({
    where: { id },
    include: {
      risks: { select: { id: true } },
      informationAssets: { select: { id: true } },
    },
  });
  if (!selected) return null;
  await prisma.$transaction(async (tx) => {
    await cleanupWatchItems(
      tx,
      "isra-risks",
      selected.risks.map((item) => item.id),
    );
    await cleanupWatchItems(
      tx,
      "information-assets",
      selected.informationAssets.map((item) => item.id),
    );
    await tx.informationAsset.deleteMany({
      where: { daxonAssessmentId: id },
    });
    await tx.israAssessment.delete({ where: { id } });
    if (selected.isActive) {
      const next = await tx.israAssessment.findFirst({
        where: { departmentKey: selected.departmentKey },
        orderBy: { importedAt: "desc" },
      });
      if (next)
        await tx.israAssessment.update({
          where: { id: next.id },
          data: { isActive: true },
        });
    }
  });
  return selected;
}

export function registerDepartmentRoutes(
  app: Express,
  prisma: PrismaClient,
  log: LogFn,
) {
  app.get("/api/departments", async (_req, res, next) => {
    try {
      const user = currentUser(res);
      if (!user)
        return res.status(401).json({ error: "Authentication required" });
      const rows = await prisma.department.findMany({
        orderBy: { name: "asc" },
      });
      const [assessments, assets] = await Promise.all([
        prisma.israAssessment.groupBy({
          by: ["departmentKey"],
          _count: { _all: true },
        }),
        prisma.informationAsset.groupBy({
          by: ["departmentKey"],
          _count: { _all: true },
        }),
      ]);
      const assessmentCount = new Map(
        assessments.map((row) => [row.departmentKey, row._count._all]),
      );
      const assetCount = new Map(
        assets.map((row) => [row.departmentKey, row._count._all]),
      );
      res.json({
        data: rows.map((row) => ({
          ...row,
          assessmentCount: assessmentCount.get(row.departmentKey) || 0,
          assetCount: assetCount.get(row.departmentKey) || 0,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/departments", async (req, res, next) => {
    try {
      const { name } = departmentBodySchema.parse(req.body);
      const key = departmentKey(name);
      const existing = await prisma.department.findUnique({
        where: { departmentKey: key },
      });
      if (existing)
        return res.status(409).json({ error: "That department already exists" });
      const row = await prisma.department.create({
        data: { name, departmentKey: key },
      });
      await log("departments", row.id, "Department Created", null, {
        name: row.name,
      });
      res.status(201).json({ data: row });
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/departments/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { name } = departmentBodySchema.parse(req.body);
      const key = departmentKey(name);
      const previous = await prisma.department.findUnique({ where: { id } });
      if (!previous)
        return res.status(404).json({ error: "Department not found" });
      const clash = await prisma.department.findFirst({
        where: { departmentKey: key, id: { not: id } },
      });
      if (clash)
        return res.status(409).json({ error: "That department already exists" });
      const row = await prisma.$transaction(async (tx) => {
        const updated = await tx.department.update({
          where: { id },
          data: { name, departmentKey: key },
        });
        if (previous.departmentKey !== key || previous.name !== name) {
          await tx.israAssessment.updateMany({
            where: { departmentKey: previous.departmentKey },
            data: { department: name, departmentKey: key },
          });
          await tx.informationAsset.updateMany({
            where: { departmentKey: previous.departmentKey },
            data: { department: name, departmentKey: key },
          });
        }
        return updated;
      });
      await log("departments", id, "Department Updated", previous, {
        name: row.name,
        actor: actorName(res),
      });
      res.json({ data: row });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/departments/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const previous = await prisma.department.findUnique({ where: { id } });
      if (!previous)
        return res.status(404).json({ error: "Department not found" });
      const assessments = await prisma.israAssessment.findMany({
        where: { departmentKey: previous.departmentKey },
        select: { id: true },
      });
      for (const assessment of assessments)
        await deleteIsraAssessment(prisma, assessment.id);
      await prisma.informationAsset.deleteMany({
        where: { departmentKey: previous.departmentKey },
      });
      await prisma.department.delete({ where: { id } });
      await log("departments", id, "Department Deleted", previous, {
        name: previous.name,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}
