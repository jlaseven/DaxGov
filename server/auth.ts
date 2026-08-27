import crypto from "node:crypto";
import type { PrismaClient, User } from "@prisma/client";
import bcrypt from "bcryptjs";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import type { LogFn } from "./activityLog.js";
import { passwordLoginEnabled } from "./ssoConfig.js";
import { assetResearchEnabled } from "./features.js";
import { isHttpsRequest } from "./security.js";

export const LOGIN_ERROR = "Invalid username or password.";
export const AUTH_REQUIRED = "Authentication required";
export const FORBIDDEN = "Forbidden";
export const SESSION_COOKIE = "cybergov_session";
export const BOOTSTRAP_ADMIN_USERNAME = "admin";
export const BOOTSTRAP_ADMIN_PASSWORD = "ChangeMe-Admin-12";
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const SESSION_SLIDE_AFTER_MS = 15 * 60 * 1000;

export const GRANTABLE_PAGES = [
  "dashboard",
  "tpsa-monitoring",
  "isra",
  "isra-assessment",
  "orca",
  "kris",
  "information-assets",
  "documents",
  "opir-actions",
  "audit-findings",
  "objectives",
  "initiatives",
  "activity-log",
  "settings",
  "regulatory-guide",
] as const;

export const FORBIDDEN_PAGES = ["user-management", "settings-restore"] as const;

export type GrantablePage = (typeof GRANTABLE_PAGES)[number];
export type UserRole = "Admin" | "User";
export type UserStatus = "Active" | "Disabled";

export type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  allowedPages: string[];
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const PAGE_GROUPS = [
  {
    label: "Overview",
    pages: [["dashboard", "Dashboard"] as const],
  },
  {
    label: "Risk and vendors",
    pages: [
      ["tpsa-monitoring", "TPSA Monitoring"] as const,
      ["isra", "ISRA SPOG"] as const,
      ["isra-assessment", "ISRA Assessment"] as const,
      ["orca", "ORCA"] as const,
      ["kris", "KRIs"] as const,
      ["information-assets", "Information Asset Inventory"] as const,
      ["regulatory-guide", "Regulatory Guide"] as const,
    ],
  },
  {
    label: "Registers",
    pages: [
      ["documents", "Governance Documents"] as const,
      ["opir-actions", "OPIR Actions"] as const,
      ["audit-findings", "Audit Findings"] as const,
      ["objectives", "OKRs"] as const,
      ["initiatives", "Initiatives"] as const,
    ],
  },
  {
    label: "Operations",
    pages: [
      ["activity-log", "Activity Log"] as const,
      ["settings", "Settings (view)"] as const,
    ],
  },
];

const GRANTABLE_SET = new Set<string>(GRANTABLE_PAGES);
const FORBIDDEN_SET = new Set<string>(FORBIDDEN_PAGES);

export function bcryptCost() {
  const cost = Number(process.env.BCRYPT_COST || 12);
  return Number.isFinite(cost) ? Math.max(4, Math.min(15, cost)) : 12;
}

export function sanitizeAllowedPages(pages: unknown): GrantablePage[] {
  const list = Array.isArray(pages) ? pages : [];
  const unique: GrantablePage[] = [];
  for (const value of list) {
    const key = String(value || "").trim();
    if (!GRANTABLE_SET.has(key) || FORBIDDEN_SET.has(key)) continue;
    if (!unique.includes(key as GrantablePage)) unique.push(key as GrantablePage);
  }
  return unique;
}

export function parseStoredPages(value: string): GrantablePage[] {
  try {
    return sanitizeAllowedPages(JSON.parse(value));
  } catch {
    return [];
  }
}

export function pagesJson(pages: string[]) {
  return JSON.stringify(sanitizeAllowedPages(pages));
}

export function validatePassword(password: string, username: string) {
  if (password.length < 12) return "Password must be at least 12 characters";
  if (password.length > 200) return "Password is too long";
  if (password.trim().toLowerCase() === username.trim().toLowerCase())
    return "Password cannot match the username";
  if (password === BOOTSTRAP_ADMIN_PASSWORD)
    return "That password is not allowed";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password))
    return "Password must include letters and numbers";
  return null;
}

export function toAuthUser(user: User): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role === "Admin" ? "Admin" : "User",
    status: user.status === "Disabled" ? "Disabled" : "Active",
    allowedPages: parseStoredPages(user.allowedPages),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function publicUser(user: AuthUser | User) {
  const auth = "allowedPages" in user && Array.isArray(user.allowedPages)
    ? (user as AuthUser)
    : toAuthUser(user as User);
  return {
    id: auth.id,
    username: auth.username,
    displayName: auth.displayName,
    role: auth.role,
    status: auth.status,
    allowedPages:
      auth.role === "Admin" ? [...GRANTABLE_PAGES] : auth.allowedPages,
    lastLoginAt: auth.lastLoginAt,
    createdAt: auth.createdAt,
    updatedAt: auth.updatedAt,
  };
}

export function mePayload(
  user: AuthUser,
  extras: { mustChangePassword?: boolean; researchEnabled?: boolean } = {},
) {
  return {
    ...publicUser(user),
    isAdmin: user.role === "Admin",
    mustChangePassword: Boolean(extras.mustChangePassword),
    researchEnabled: extras.researchEnabled !== false,
  };
}

export function userHasPage(user: AuthUser, page: string) {
  if (user.status !== "Active") return false;
  if (FORBIDDEN_SET.has(page)) return user.role === "Admin";
  if (user.role === "Admin") return true;
  return user.allowedPages.includes(page);
}

export function isDaxonQuestionnaireApi(method: string, path: string) {
  const normalized = path.replace(/\/+$/, "") || "/";
  if (method === "POST" && normalized === "/isra-spog/import") return true;
  return (
    (method === "GET" || method === "PUT") &&
    /^\/isra-spog\/assessments\/\d+$/.test(normalized)
  );
}

export function userCanAccessPath(
  user: AuthUser,
  method: string,
  path: string,
) {
  const access = requiredAccess(method, path);
  if (access === "public" || access === "auth") return true;
  if (access === "admin") return user.role === "Admin";
  if (userHasPage(user, access)) return true;
  return (
    access === "isra" &&
    userHasPage(user, "isra-assessment") &&
    isDaxonQuestionnaireApi(method, path)
  );
}

export function wouldLeaveNoActiveAdmin(options: {
  targetRole: string;
  targetStatus: string;
  nextRole?: string;
  nextStatus?: string;
  deleting?: boolean;
  activeAdminCount: number;
}) {
  if (options.targetRole !== "Admin" || options.targetStatus !== "Active")
    return false;
  const nextRole = options.nextRole ?? options.targetRole;
  const nextStatus = options.nextStatus ?? options.targetStatus;
  const losingAdmin =
    Boolean(options.deleting) ||
    nextRole !== "Admin" ||
    nextStatus !== "Active";
  return losingAdmin && options.activeAdminCount <= 1;
}

export function apiPath(req: Request) {
  const full = String(req.originalUrl || req.url || "").split("?")[0];
  const path = full.startsWith("/api") ? full.slice(4) : full;
  return path.replace(/\/+$/, "") || "/";
}

export function requiredAccess(
  _method: string,
  path: string,
): "public" | "auth" | "admin" | GrantablePage {
  const normalized = path.replace(/\/+$/, "") || "/";
  if (
    normalized === "/health" ||
    normalized === "/login" ||
    normalized === "/logout" ||
    normalized === "/auth/sso" ||
    normalized === "/auth/jumpcloud" ||
    normalized === "/auth/jumpcloud/callback" ||
    normalized === "/auth/jumpcloud/saml" ||
    normalized === "/auth/jumpcloud/saml/acs" ||
    normalized === "/auth/jumpcloud/saml/metadata"
  )
    return "public";
  if (normalized === "/me" || normalized === "/me/password") return "auth";
  if (normalized.startsWith("/departments")) {
    if (_method === "GET") return "auth";
    return "admin";
  }
  if (
    normalized.startsWith("/notifications") ||
    normalized.startsWith("/watchlist")
  )
    return "auth";
  if (normalized === "/users" || normalized.startsWith("/users/"))
    return "admin";
  if (normalized.startsWith("/settings/restore")) return "admin";
  if (normalized === "/settings/backup" || normalized.startsWith("/settings/backup/"))
    return "admin";
  if (normalized === "/dashboard" || normalized.startsWith("/dashboard/"))
    return "dashboard";
  if (
    normalized.startsWith("/tpsa-records") ||
    normalized.startsWith("/tpsa-certifications")
  )
    return "tpsa-monitoring";
  if (normalized.startsWith("/isra-spog")) return "isra";
  if (
    normalized.startsWith("/risk-monitoring") ||
    normalized.startsWith("/orca-risk-reviews")
  )
    return "auth";
  if (normalized.startsWith("/orca")) return "orca";
  if (
    normalized.startsWith("/kri-sheets") ||
    normalized.startsWith("/kri-records")
  )
    return "kris";
  if (normalized.startsWith("/kri-mappings")) return "auth";
  if (normalized.startsWith("/information-assets")) return "information-assets";
  if (normalized.startsWith("/regulatory-guide")) return "regulatory-guide";
  if (normalized.startsWith("/documents")) return "documents";
  if (normalized.startsWith("/opir-actions")) return "opir-actions";
  if (normalized.startsWith("/audit-findings")) return "audit-findings";
  if (normalized.startsWith("/objectives") || normalized.startsWith("/okr-tasks"))
    return "objectives";
  if (
    normalized.startsWith("/initiatives") ||
    normalized.startsWith("/sub-initiatives")
  )
    return "initiatives";
  if (normalized.startsWith("/activity-log")) return "activity-log";
  if (normalized.startsWith("/settings")) return "settings";
  return "auth";
}

export function currentUser(res: Response): AuthUser | undefined {
  return res.locals.user as AuthUser | undefined;
}

export function actorName(res: Response) {
  return currentUser(res)?.displayName || "Unknown";
}

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function shouldSlideSession(expiresAt: Date, now = new Date()) {
  return (
    expiresAt.getTime() - now.getTime() <=
    SESSION_TTL_MS - SESSION_SLIDE_AFTER_MS
  );
}

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: isHttpsRequest(req),
    path: "/",
    maxAge: SESSION_TTL_MS,
  };
}

export async function createSession(
  prisma: PrismaClient,
  req: Request,
  res: Response,
  userId: number,
) {
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  res.cookie(SESSION_COOKIE, token, cookieOptions(req));
}

export async function destroySession(
  prisma: PrismaClient,
  req: Request,
  res: Response,
) {
  const token = String(req.cookies?.[SESSION_COOKIE] || "");
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    secure: isHttpsRequest(req),
    path: "/",
  });
}

export async function invalidateUserSessions(
  prisma: PrismaClient,
  userId: number,
  keepSessionId?: number,
) {
  await prisma.session.deleteMany({
    where: keepSessionId
      ? { userId, id: { not: keepSessionId } }
      : { userId },
  });
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, bcryptCost());
}

let dummyHash: string | undefined;
async function dummyPasswordHash() {
  if (!dummyHash) dummyHash = await bcrypt.hash("dummy-password-xx", bcryptCost());
  return dummyHash;
}

export const loginBodySchema = z
  .object({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(200),
  })
  .strip();

export function loginRateLimiter() {
  const windowMs = Number(process.env.LOGIN_WINDOW_MS) || 15 * 60 * 1000;
  const limit = Number(process.env.LOGIN_MAX_ATTEMPTS) || 5;
  return rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again later." },
    validate: false,
    keyGenerator: (req) => {
      const username = String((req.body as { username?: string } | undefined)?.username || "")
        .trim()
        .toLowerCase();
      return `${req.ip || "127.0.0.1"}:${username}`;
    },
  });
}

export function bootstrapAdminPassword() {
  return process.env.BOOTSTRAP_ADMIN_PASSWORD || BOOTSTRAP_ADMIN_PASSWORD;
}

export async function ensureBootstrapAdmin(prisma: PrismaClient) {
  const count = await prisma.user.count();
  if (count > 0) return { created: false as const };
  const password = bootstrapAdminPassword();
  if (
    process.env.NODE_ENV === "production" &&
    password === BOOTSTRAP_ADMIN_PASSWORD
  ) {
    console.warn(
      "First admin is using the built-in bootstrap password. Set BOOTSTRAP_ADMIN_PASSWORD before production use.",
    );
  }
  await prisma.user.create({
    data: {
      username: BOOTSTRAP_ADMIN_USERNAME,
      displayName: "Administrator",
      passwordHash: await hashPassword(password),
      role: "Admin",
      status: "Active",
      allowedPages: pagesJson([...GRANTABLE_PAGES]),
    },
  });
  return { created: true as const };
}

const ACCOUNT_LOCK_AFTER = 8;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const loginLocks = new Map<string, { fails: number; lockedUntil: number }>();
const bootstrapPasswordCache = new Map<string, boolean>();

export function accountLocked(username: string, now = Date.now()) {
  const state = loginLocks.get(username.trim().toLowerCase());
  return Boolean(state && state.lockedUntil > now);
}

export function recordLoginFailure(username: string, now = Date.now()) {
  const key = username.trim().toLowerCase();
  const state = loginLocks.get(key) || { fails: 0, lockedUntil: 0 };
  state.fails += 1;
  if (state.fails >= ACCOUNT_LOCK_AFTER)
    state.lockedUntil = now + ACCOUNT_LOCK_MS;
  loginLocks.set(key, state);
}

export function clearLoginFailures(username: string) {
  loginLocks.delete(username.trim().toLowerCase());
}

export async function userMustChangePassword(user: {
  username: string;
  passwordHash: string;
}) {
  if (user.username !== BOOTSTRAP_ADMIN_USERNAME) return false;
  const cached = bootstrapPasswordCache.get(user.passwordHash);
  if (cached != null) return cached;
  const must = await bcrypt.compare(BOOTSTRAP_ADMIN_PASSWORD, user.passwordHash);
  bootstrapPasswordCache.set(user.passwordHash, must);
  return must;
}

export async function verifyCurrentPassword(
  prisma: PrismaClient,
  userId: number,
  password: string,
) {
  if (!password) return false;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  return bcrypt.compare(password, user.passwordHash);
}

export function attachSession(prisma: PrismaClient) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = String(req.cookies?.[SESSION_COOKIE] || "");
      if (!token) return next();
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });
      if (!session || session.expiresAt <= new Date()) {
        if (session)
          await prisma.session.deleteMany({ where: { id: session.id } });
        res.clearCookie(SESSION_COOKIE, {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: isHttpsRequest(req),
        });
        return next();
      }
      if (session.user.status !== "Active") {
        await prisma.session.deleteMany({ where: { userId: session.userId } });
        res.clearCookie(SESSION_COOKIE, {
          path: "/",
          httpOnly: true,
          sameSite: "strict",
          secure: isHttpsRequest(req),
        });
        return next();
      }
      res.locals.user = toAuthUser(session.user);
      res.locals.sessionId = session.id;
      res.locals.mustChangePassword = await userMustChangePassword(
        session.user,
      );
      if (shouldSlideSession(session.expiresAt)) {
        const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
        await prisma.session.update({
          where: { id: session.id },
          data: { expiresAt },
        });
        res.cookie(SESSION_COOKIE, token, cookieOptions(req));
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuthAndPage() {
  return (req: Request, res: Response, next: NextFunction) => {
    const path = apiPath(req);
    const access = requiredAccess(req.method, path);
    if (access === "public") return next();
    const user = currentUser(res);
    if (!user) {
      return res.status(401).json({ error: AUTH_REQUIRED });
    }
    if (access === "auth") return next();
    if (access === "admin") {
      if (user.role !== "Admin")
        return res.status(403).json({ error: FORBIDDEN });
      return next();
    }
    if (!userCanAccessPath(user, req.method, path))
      return res.status(403).json({ error: FORBIDDEN });
    next();
  };
}

export function requirePasswordChange() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!res.locals.mustChangePassword) return next();
    const path = apiPath(req);
    const allowed =
      (req.method === "GET" && path === "/me") ||
      (req.method === "POST" && path === "/me/password") ||
      (req.method === "POST" && path === "/logout");
    if (allowed) return next();
    return res.status(403).json({
      error: "Password change required",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
  };
}

export async function authenticateLogin(
  prisma: PrismaClient,
  username: string,
  password: string,
) {
  const normalized = username.trim().toLowerCase();
  if (accountLocked(normalized)) return null;
  const user = await prisma.user.findUnique({ where: { username: normalized } });
  const hash = user?.passwordHash || (await dummyPasswordHash());
  const matches = await bcrypt.compare(password, hash);
  if (!user || user.status !== "Active" || !matches) {
    recordLoginFailure(normalized);
    return null;
  }
  clearLoginFailures(normalized);
  return toAuthUser(user);
}

export function registerAuthRoutes(
  app: import("express").Express,
  prisma: PrismaClient,
  log: LogFn,
) {
  app.post("/api/login", loginRateLimiter(), async (req, res, next) => {
    try {
      if (!passwordLoginEnabled())
        return res.status(403).json({
          error: "Use JumpCloud single sign-on.",
        });
      const parsed = loginBodySchema.safeParse(req.body);
      if (!parsed.success) {
        await log("auth", "unknown", "auth.login.failure", null, null, {
          outcome: "failure",
          eventType: "auth",
          httpStatus: 401,
        });
        return res.status(401).json({ error: LOGIN_ERROR });
      }
      const user = await authenticateLogin(
        prisma,
        parsed.data.username,
        parsed.data.password,
      );
      if (!user) {
        await log("auth", parsed.data.username, "auth.login.failure", null, null, {
          outcome: "failure",
          eventType: "auth",
          httpStatus: 401,
          targetName: parsed.data.username,
        });
        return res.status(401).json({ error: LOGIN_ERROR });
      }
      await destroySession(prisma, req, res);
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await createSession(prisma, req, res, user.id);
      await log("auth", user.id, "auth.login.success", null, {
        username: user.username,
      }, {
        eventType: "auth",
        httpStatus: 200,
        targetName: user.username,
        actorId: String(user.id),
        actorUsername: user.username,
        actorRole: user.role,
      });
      const fresh = await prisma.user.findUnique({ where: { id: user.id } });
      res.json({
        data: mePayload(toAuthUser(fresh!), {
          mustChangePassword: await userMustChangePassword(fresh!),
          researchEnabled: assetResearchEnabled(),
        }),
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/logout", async (req, res, next) => {
    try {
      const user = currentUser(res);
      await log("auth", user?.id || "session", "auth.logout", null, {
        username: user?.username,
      }, {
        eventType: "auth",
        httpStatus: 204,
        targetName: user?.username,
      });
      await destroySession(prisma, req, res);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/me", (req, res) => {
    const user = currentUser(res);
    if (!user) return res.status(401).json({ error: AUTH_REQUIRED });
    res.json({
      data: mePayload(user, {
        mustChangePassword: Boolean(res.locals.mustChangePassword),
        researchEnabled: assetResearchEnabled(),
      }),
    });
  });

  app.post("/api/me/password", async (req, res, next) => {
    try {
      const user = currentUser(res);
      if (!user) return res.status(401).json({ error: AUTH_REQUIRED });
      const parsed = z
        .object({
          currentPassword: z.string().min(1).max(200),
          password: z.string().min(1).max(200),
        })
        .strip()
        .safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "Current and new password are required" });
      const ok = await verifyCurrentPassword(
        prisma,
        user.id,
        parsed.data.currentPassword,
      );
      if (!ok)
        return res.status(401).json({ error: LOGIN_ERROR });
      const passwordError = validatePassword(parsed.data.password, user.username);
      if (passwordError) return res.status(400).json({ error: passwordError });
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(parsed.data.password) },
      });
      bootstrapPasswordCache.clear();
      await log("auth", user.id, "auth.password_change", null, {
        username: user.username,
      }, {
        eventType: "auth",
        httpStatus: 200,
        targetName: user.username,
        actorId: String(user.id),
        actorUsername: user.username,
        actorRole: user.role,
      });
      const fresh = await prisma.user.findUnique({ where: { id: user.id } });
      res.locals.mustChangePassword = await userMustChangePassword(fresh!);
      res.json({
        data: mePayload(toAuthUser(fresh!), {
          mustChangePassword: res.locals.mustChangePassword,
          researchEnabled: assetResearchEnabled(),
        }),
      });
    } catch (error) {
      next(error);
    }
  });
}
