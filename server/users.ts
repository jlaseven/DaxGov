import type { PrismaClient } from "@prisma/client";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { formatActivityRow, toUserAccessLog, type LogFn } from "./activityLog.js";
import {
  FORBIDDEN,
  GRANTABLE_PAGES,
  PAGE_GROUPS,
  createSession,
  currentUser,
  hashPassword,
  invalidateUserSessions,
  pagesJson,
  publicUser,
  sanitizeAllowedPages,
  toAuthUser,
  validatePassword,
  wouldLeaveNoActiveAdmin,
} from "./auth.js";

const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z0-9._-]+$/, "Username may contain letters, numbers, dots, underscores, and hyphens");

const createUserSchema = z
  .object({
    username: usernameSchema,
    displayName: z.string().trim().min(1).max(120),
    password: z.string().min(1).max(200),
    role: z.enum(["Admin", "User"]),
    status: z.enum(["Active", "Disabled"]).optional().default("Active"),
    allowedPages: z.array(z.string()).optional(),
  })
  .strip();

const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    password: z.string().min(1).max(200).optional(),
    role: z.enum(["Admin", "User"]).optional(),
    status: z.enum(["Active", "Disabled"]).optional(),
    allowedPages: z.array(z.string()).optional(),
  })
  .strip();

const resetPasswordSchema = z
  .object({
    password: z.string().min(1).max(200),
  })
  .strip();

async function activeAdminCount(prisma: PrismaClient) {
  return prisma.user.count({
    where: { role: "Admin", status: "Active" },
  });
}

function lastAdminError() {
  return {
    error: "The last Active Admin cannot be deleted, disabled, or demoted",
  };
}

function pagesForRole(role: "Admin" | "User", requested: unknown) {
  if (role === "Admin") return pagesJson([...GRANTABLE_PAGES]);
  const pages = sanitizeAllowedPages(requested);
  if (!pages.length) {
    throw Object.assign(new Error("At least one page is required for a User"), {
      status: 400,
    });
  }
  return pagesJson(pages);
}

function safeUserLog(user: {
  username: string;
  displayName: string;
  role: string;
  status: string;
  allowedPages: string;
}) {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    allowedPages: sanitizeAllowedPages(
      (() => {
        try {
          return JSON.parse(user.allowedPages);
        } catch {
          return [];
        }
      })(),
    ),
  };
}

export function registerUserRoutes(
  app: Express,
  prisma: PrismaClient,
  log: LogFn,
) {
  app.get("/api/users", async (_req, res, next) => {
    try {
      const users = await prisma.user.findMany({
        orderBy: [{ role: "asc" }, { username: "asc" }],
      });
      res.json({
        data: users.map((user) => publicUser(toAuthUser(user))),
        meta: {
          grantablePages: [...GRANTABLE_PAGES],
          groups: PAGE_GROUPS,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users", async (req, res, next) => {
    try {
      const data = createUserSchema.parse(req.body);
      const username = data.username.toLowerCase();
      const passwordError = validatePassword(data.password, username);
      if (passwordError)
        return res.status(400).json({ error: passwordError });
      const allowedPages = pagesForRole(data.role, data.allowedPages);
      const user = await prisma.user.create({
        data: {
          username,
          displayName: data.displayName,
          passwordHash: await hashPassword(data.password),
          role: data.role,
          status: data.status,
          allowedPages,
        },
      });
      await log("user", user.id, "Created", null, safeUserLog(user), {
        targetName: user.username,
        httpStatus: 201,
      });
      res.status(201).json({ data: publicUser(toAuthUser(user)) });
    } catch (error: any) {
      if (error?.status === 400)
        return res.status(400).json({ error: error.message });
      next(error);
    }
  });

  app.get("/api/users/logs", async (_req, res, next) => {
    try {
      const rows = await prisma.activityLog.findMany({
        where: {
          OR: [
            { entityType: "user" },
            { httpPath: { startsWith: "/api/users" } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      res.json({
        data: rows
          .filter((row) => row.httpPath !== "/api/users/logs")
          .map((row) => toUserAccessLog(formatActivityRow(row))),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/users/:id", async (req, res, next) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: Number(req.params.id) },
      });
      if (!user) return res.status(404).json({ error: "User not found" });
      await log("user", user.id, "user.read", null, { username: user.username }, {
        targetName: user.username,
        httpStatus: 200,
      });
      res.json({ data: publicUser(toAuthUser(user)) });
    } catch (error) {
      next(error);
    }
  });

  const updateHandler = async (req: Request, res: Response, next: any) => {
    try {
      const id = Number(req.params.id);
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });
      const data = updateUserSchema.parse(req.body);
      const nextRole = data.role ?? (existing.role as "Admin" | "User");
      const nextStatus = data.status ?? (existing.status as "Active" | "Disabled");
      if (
        wouldLeaveNoActiveAdmin({
          targetRole: existing.role,
          targetStatus: existing.status,
          nextRole,
          nextStatus,
          activeAdminCount: await activeAdminCount(prisma),
        })
      ) {
        return res.status(400).json(lastAdminError());
      }
      if (data.password) {
        const passwordError = validatePassword(data.password, existing.username);
        if (passwordError)
          return res.status(400).json({ error: passwordError });
      }
      const allowedPages =
        data.role || data.allowedPages
          ? pagesForRole(
              nextRole,
              data.allowedPages ?? JSON.parse(existing.allowedPages || "[]"),
            )
          : existing.allowedPages;
      const updated = await prisma.user.update({
        where: { id },
        data: {
          ...(data.displayName ? { displayName: data.displayName } : {}),
          ...(data.role ? { role: data.role } : {}),
          ...(data.status ? { status: data.status } : {}),
          ...(data.password
            ? { passwordHash: await hashPassword(data.password) }
            : {}),
          allowedPages,
        },
      });
      const privilegeChanged =
        existing.role !== updated.role ||
        existing.status !== updated.status ||
        existing.allowedPages !== updated.allowedPages;
      if (data.password) {
        if (currentUser(res)?.id === id)
          await createSession(prisma, req, res, id);
        else await invalidateUserSessions(prisma, id);
      } else if (privilegeChanged) {
        const keep =
          currentUser(res)?.id === id ? (res.locals.sessionId as number) : undefined;
        await invalidateUserSessions(prisma, id, keep);
      }
      await log(
        "user",
        id,
        "Edited",
        safeUserLog(existing),
        safeUserLog(updated),
        { targetName: updated.username, httpStatus: 200 },
      );
      res.json({ data: publicUser(toAuthUser(updated)) });
    } catch (error: any) {
      if (error?.status === 400)
        return res.status(400).json({ error: error.message });
      next(error);
    }
  };

  app.put("/api/users/:id", updateHandler);
  app.patch("/api/users/:id", updateHandler);

  app.post("/api/users/:id/disable", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });
      if (
        wouldLeaveNoActiveAdmin({
          targetRole: existing.role,
          targetStatus: existing.status,
          nextStatus: "Disabled",
          activeAdminCount: await activeAdminCount(prisma),
        })
      ) {
        return res.status(400).json(lastAdminError());
      }
      const updated = await prisma.user.update({
        where: { id },
        data: { status: "Disabled" },
      });
      await invalidateUserSessions(prisma, id);
      await log("user", id, "Disabled", safeUserLog(existing), safeUserLog(updated), {
        targetName: updated.username,
        httpStatus: 200,
      });
      res.json({ data: publicUser(toAuthUser(updated)) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users/:id/enable", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });
      const updated = await prisma.user.update({
        where: { id },
        data: { status: "Active" },
      });
      await log("user", id, "Enabled", safeUserLog(existing), safeUserLog(updated), {
        targetName: updated.username,
        httpStatus: 200,
      });
      res.json({ data: publicUser(toAuthUser(updated)) });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/users/:id/reset-password", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });
      const { password } = resetPasswordSchema.parse(req.body);
      const passwordError = validatePassword(password, existing.username);
      if (passwordError)
        return res.status(400).json({ error: passwordError });
      await prisma.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(password) },
      });
      if (currentUser(res)?.id === id)
        await createSession(prisma, req, res, id);
      else await invalidateUserSessions(prisma, id);
      await log("user", id, "Password Reset", { username: existing.username }, {
        username: existing.username,
      }, { targetName: existing.username, httpStatus: 200 });
      res.json({ data: { id, username: existing.username } });
    } catch (error) {
      next(error);
    }
  });

  app.delete("/api/users/:id", async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: "User not found" });
      if (
        wouldLeaveNoActiveAdmin({
          targetRole: existing.role,
          targetStatus: existing.status,
          deleting: true,
          activeAdminCount: await activeAdminCount(prisma),
        })
      ) {
        return res.status(400).json(lastAdminError());
      }
      await prisma.user.delete({ where: { id } });
      await log("user", id, "Deleted", safeUserLog(existing), null, {
        targetName: existing.username,
        httpStatus: 204,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
}
