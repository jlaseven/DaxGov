import { execSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BOOTSTRAP_ADMIN_PASSWORD,
  FORBIDDEN,
  GRANTABLE_PAGES,
  LOGIN_ERROR,
  SESSION_TTL_MS,
  SESSION_SLIDE_AFTER_MS,
  isDaxonQuestionnaireApi,
  pagesJson,
  requiredAccess,
  sanitizeAllowedPages,
  shouldSlideSession,
  userHasPage,
  validatePassword,
  wouldLeaveNoActiveAdmin,
} from "../server/auth";
import {
  firstAllowedPath,
  pageKeyForPath,
  userCanOpen,
} from "../client/src/pages";

describe("auth helpers", () => {
  it("strips unknown and never-grantable page keys", () => {
    expect(
      sanitizeAllowedPages([
        "dashboard",
        "user-management",
        "settings-restore",
        "not-a-page",
        "isra",
        "dashboard",
      ]),
    ).toEqual(["dashboard", "isra"]);
  });

  it("slides a session after the idle window so active users stay signed in", () => {
    expect(SESSION_TTL_MS).toBe(60 * 60 * 1000);
    const now = new Date("2026-08-26T03:00:00.000Z");
    expect(
      shouldSlideSession(new Date(now.getTime() + SESSION_TTL_MS), now),
    ).toBe(false);
    expect(
      shouldSlideSession(
        new Date(now.getTime() + SESSION_TTL_MS - 20 * 60 * 1000),
        now,
      ),
    ).toBe(true);
  });

  it("maps API routes to session, page, or admin access", () => {
    expect(requiredAccess("POST", "/login")).toBe("public");
    expect(requiredAccess("GET", "/auth/sso")).toBe("public");
    expect(requiredAccess("GET", "/auth/jumpcloud")).toBe("public");
    expect(requiredAccess("GET", "/auth/jumpcloud/callback")).toBe("public");
    expect(requiredAccess("GET", "/auth/jumpcloud/saml")).toBe("public");
    expect(requiredAccess("POST", "/auth/jumpcloud/saml/acs")).toBe("public");
    expect(requiredAccess("GET", "/auth/jumpcloud/saml/metadata")).toBe(
      "public",
    );
    expect(requiredAccess("GET", "/health")).toBe("public");
    expect(requiredAccess("GET", "/me")).toBe("auth");
    expect(requiredAccess("GET", "/users")).toBe("admin");
    expect(requiredAccess("PUT", "/users/1")).toBe("admin");
    expect(requiredAccess("POST", "/settings/restore")).toBe("admin");
    expect(requiredAccess("POST", "/settings/restore-upload")).toBe("admin");
    expect(requiredAccess("GET", "/settings/database")).toBe("settings");
    expect(requiredAccess("GET", "/tpsa-records")).toBe("tpsa-monitoring");
    expect(requiredAccess("GET", "/isra-spog")).toBe("isra");
    expect(isDaxonQuestionnaireApi("POST", "/isra-spog/import")).toBe(true);
    expect(isDaxonQuestionnaireApi("GET", "/isra-spog/assessments/12")).toBe(
      true,
    );
    expect(isDaxonQuestionnaireApi("DELETE", "/isra-spog/assessments/12")).toBe(
      false,
    );
    expect(requiredAccess("GET", "/orca")).toBe("orca");
    expect(requiredAccess("GET", "/kri-records")).toBe("kris");
    expect(requiredAccess("POST", "/kri-sheets/rollover")).toBe("kris");
    expect(requiredAccess("GET", "/kri-mappings")).toBe("auth");
    expect(requiredAccess("GET", "/risk-monitoring/coverage")).toBe("auth");
    expect(requiredAccess("GET", "/orca-risk-reviews")).toBe("auth");
    expect(requiredAccess("GET", "/regulatory-guide")).toBe("regulatory-guide");
    expect(requiredAccess("GET", "/documents")).toBe("documents");
    expect(requiredAccess("GET", "/okr-tasks")).toBe("objectives");
    expect(requiredAccess("GET", "/notifications")).toBe("auth");
    expect(requiredAccess("POST", "/notifications/read")).toBe("auth");
    expect(requiredAccess("GET", "/watchlist")).toBe("auth");
    expect(requiredAccess("POST", "/watchlist")).toBe("auth");
    expect(requiredAccess("DELETE", "/watchlist/documents/1")).toBe("auth");
    expect(requiredAccess("GET", "/departments")).toBe("auth");
    expect(requiredAccess("POST", "/departments")).toBe("admin");
    expect(requiredAccess("DELETE", "/departments/1")).toBe("admin");
    expect(requiredAccess("GET", "/settings/backup/x")).toBe("admin");
    expect(requiredAccess("POST", "/settings/backup")).toBe("admin");
    expect(requiredAccess("POST", "/me/password")).toBe("auth");
  });

  it("does not let a User open admin-only pages", () => {
    const user = {
      id: 2,
      username: "analyst",
      displayName: "Analyst",
      role: "User" as const,
      status: "Active" as const,
      allowedPages: ["dashboard", "user-management", "settings-restore"],
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(userHasPage(user, "dashboard")).toBe(true);
    expect(userHasPage(user, "user-management")).toBe(false);
    expect(userHasPage(user, "settings-restore")).toBe(false);
    expect(userCanOpen(user, "user-management")).toBe(false);
    expect(pageKeyForPath("/users")).toBe("user-management");
    expect(firstAllowedPath(user)).toBe("/");
  });

  it("refuses actions that would leave zero Active Admins", () => {
    const base = {
      targetRole: "Admin",
      targetStatus: "Active",
      activeAdminCount: 1,
    };
    expect(wouldLeaveNoActiveAdmin({ ...base, deleting: true })).toBe(true);
    expect(wouldLeaveNoActiveAdmin({ ...base, nextRole: "User" })).toBe(true);
    expect(wouldLeaveNoActiveAdmin({ ...base, nextStatus: "Disabled" })).toBe(
      true,
    );
    expect(
      wouldLeaveNoActiveAdmin({ ...base, activeAdminCount: 2, deleting: true }),
    ).toBe(false);
  });

  it("requires letters, numbers, and rejects the bootstrap password", () => {
    expect(validatePassword("short", "admin")).toMatch(/12 characters/);
    expect(validatePassword("aaaaaaaaaaaa", "admin")).toMatch(/letters and numbers/);
    expect(validatePassword(BOOTSTRAP_ADMIN_PASSWORD, "admin")).toMatch(
      /not allowed/,
    );
    expect(validatePassword("AdminPass-12x", "analyst")).toBeNull();
  });
});

describe("auth HTTP", () => {
  let app: any;
  let prisma: any;
  let request: any;
  let dir = "";
  const adminPassword = "AdminPass-12x";
  const userPassword = "UserPass-12xx";

  async function login(username: string, password: string) {
    const agent = request.agent(app);
    const response = await agent
      .post("/api/login")
      .set("X-Requested-With", "DaxGov")
      .send({ username, password });
    return { agent, response };
  }

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "cybergov-auth-"));
    const dbPath = path.join(dir, "test.db");
    process.env.DATABASE_URL = `file:${dbPath}`;
    process.env.BCRYPT_COST = "4";
    process.env.LOGIN_MAX_ATTEMPTS = "5";
    process.env.LOGIN_WINDOW_MS = "900000";
    execSync("npx prisma migrate deploy", {
      cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
      env: { ...process.env },
      stdio: "pipe",
    });
    const mod = await import("../server/app");
    app = mod.default;
    prisma = mod.prisma;
    request = ((await import("supertest")) as any).default;
    const { hashPassword } = await import("../server/auth");
    await prisma.user.create({
      data: {
        username: "admin",
        displayName: "Administrator",
        passwordHash: await hashPassword(adminPassword),
        role: "Admin",
        status: "Active",
        allowedPages: pagesJson([...GRANTABLE_PAGES]),
      },
    });
    await prisma.user.create({
      data: {
        username: "tpsa.user",
        displayName: "TPSA Analyst",
        passwordHash: await hashPassword(userPassword),
        role: "User",
        status: "Active",
        allowedPages: pagesJson(["tpsa-monitoring"]),
      },
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("rejects unauthenticated access to records and user management", async () => {
    const records = await request(app).get("/api/tpsa-records");
    expect(records.status).toBe(401);
    expect(records.body.data).toBeUndefined();
    const users = await request(app).get("/api/users");
    expect(users.status).toBe(401);
    expect(users.body).toEqual({ error: "Authentication required" });
    expect(users.body.data).toBeUndefined();
    const health = await request(app).get("/api/health");
    expect(health.status).toBe(200);
    expect(health.headers["x-content-type-options"]).toBe("nosniff");
    expect(health.headers["x-frame-options"]).toBe("DENY");
    expect(health.headers["cache-control"]).toMatch(/no-store/);
    const live = await request(app).get("/health");
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: "ok" });
  });

  it("keeps JumpCloud off and password login on until SSO is configured", async () => {
    const sso = await request(app).get("/api/auth/sso");
    expect(sso.status).toBe(200);
    expect(sso.body).toEqual({
      data: { jumpcloud: false, passwordLogin: true, protocol: null },
    });
    const start = await request(app).get("/api/auth/jumpcloud");
    expect(start.status).toBe(404);
    expect(start.body.error).toMatch(/not configured/i);
    const saml = await request(app).get("/api/auth/jumpcloud/saml");
    expect(saml.status).toBe(404);
    const metadata = await request(app).get(
      "/api/auth/jumpcloud/saml/metadata",
    );
    expect(metadata.status).toBe(404);
  });

  it("accepts JumpCloud SAML ACS posts without the DaxGov browser header", async () => {
    const response = await request(app)
      .post("/api/auth/jumpcloud/saml/acs")
      .type("form")
      .send({ SAMLResponse: "dGVzdA==" });
    expect(response.status).toBe(302);
    expect(response.headers.location).toMatch(/sso_error=not_configured/);
  });

  it("returns the same generic login error and does not reveal usernames", async () => {
    const missing = await request(app)
      .post("/api/login")
      .set("X-Requested-With", "DaxGov")
      .send({ username: "no-such-user", password: "wrong-password-12" });
    const wrong = await request(app)
      .post("/api/login")
      .set("X-Requested-With", "DaxGov")
      .send({ username: "admin", password: "wrong-password-12" });
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(missing.body).toEqual({ error: LOGIN_ERROR });
    expect(wrong.body).toEqual(missing.body);
  });

  it("rate-limits repeated failed logins without revealing a valid username", async () => {
    const username = "rate.limit.user";
    let last;
    for (let i = 0; i < 6; i++) {
      last = await request(app)
        .post("/api/login")
        .set("X-Requested-With", "DaxGov")
        .send({ username, password: "not-the-password" });
    }
    expect(last?.status).toBe(429);
    expect(String(last?.body.error || "")).not.toMatch(/username/i);
    expect(last?.body.data).toBeUndefined();
  });

  it("ends the previous session when the same user signs in again", async () => {
    const first = await login("tpsa.user", userPassword);
    expect(first.response.status).toBe(200);
    const second = await login("tpsa.user", userPassword);
    expect(second.response.status).toBe(200);
    const stale = await first.agent.get("/api/me");
    expect(stale.status).toBe(401);
    expect(stale.body).toEqual({ error: "Authentication required" });
    const current = await second.agent.get("/api/me");
    expect(current.status).toBe(200);
    expect(current.body.data.username).toBe("tpsa.user");
    const sessions = await prisma.session.findMany({
      where: { userId: current.body.data.id },
    });
    expect(sessions).toHaveLength(1);
  });

  it("exposes session and rate-limit controls in Settings", async () => {
    const { agent } = await login("admin", adminPassword);
    const response = await agent.get("/api/settings/database");
    expect(response.status).toBe(200);
    expect(response.body.data.session).toEqual({
      ttlMs: SESSION_TTL_MS,
      slideAfterMs: SESSION_SLIDE_AFTER_MS,
      concurrent: false,
    });
    expect(response.body.data.rateLimits.login.limit).toBe(5);
    expect(response.body.data.rateLimits.api.limit).toBeGreaterThan(0);
    expect(response.body.data.rateLimits.accountLock.failures).toBe(8);
  });

  it("blocks a User from the user-management API, including their own id", async () => {
    const { agent, response } = await login("tpsa.user", userPassword);
    expect(response.status).toBe(200);
    const list = await agent.get("/api/users");
    expect(list.status).toBe(403);
    expect(list.body).toEqual({ error: FORBIDDEN });
    expect(list.body.data).toBeUndefined();
    const self = await prisma.user.findUnique({
      where: { username: "tpsa.user" },
    });
    const own = await agent.get(`/api/users/${self.id}`);
    expect(own.status).toBe(403);
    expect(own.body.data).toBeUndefined();
    const escalate = await agent
      .put(`/api/users/${self.id}`)
      .set("X-Requested-With", "DaxGov")
      .send({
      role: "Admin",
      allowedPages: ["user-management", "documents"],
    });
    expect(escalate.status).toBe(403);
    expect(escalate.body.data).toBeUndefined();
    const fresh = await prisma.user.findUnique({
      where: { username: "tpsa.user" },
    });
    expect(fresh.role).toBe("User");
    expect(JSON.parse(fresh.allowedPages)).toEqual(["tpsa-monitoring"]);
  });

  it("enforces page grants and does not allow ISRA or documents with only tpsa-monitoring", async () => {
    const { agent } = await login("tpsa.user", userPassword);
    const tpsa = await agent.get("/api/tpsa-records");
    expect(tpsa.status).toBe(200);
    const isra = await agent.get("/api/isra-spog");
    expect(isra.status).toBe(403);
    expect(isra.body.data).toBeUndefined();
    const documents = await agent.get("/api/documents");
    expect(documents.status).toBe(403);
    expect(documents.body.data).toBeUndefined();
    const kris = await agent.get("/api/kri-records");
    expect(kris.status).toBe(403);
    const mappings = await agent.get("/api/kri-mappings");
    expect(mappings.status).toBe(403);
  });

  it("applies an Admin-granted page set on the next authenticated request", async () => {
    const admin = await login("admin", adminPassword);
    expect(admin.response.status).toBe(200);
    const target = await prisma.user.findUnique({
      where: { username: "tpsa.user" },
    });
    const granted = await admin.agent
      .put(`/api/users/${target.id}`)
      .set("X-Requested-With", "DaxGov")
      .send({
      allowedPages: ["tpsa-monitoring", "documents", "user-management"],
    });
    expect(granted.status).toBe(200);
    expect(granted.body.data.allowedPages).toEqual([
      "tpsa-monitoring",
      "documents",
    ]);
    const stale = await request.agent(app);
    const oldCookie = admin.response.headers["set-cookie"];
    void oldCookie;
    const previousSession = await login("tpsa.user", userPassword);
    const { agent } = previousSession;
    const documents = await agent.get("/api/documents");
    expect(documents.status).toBe(200);
    const users = await agent.get("/api/users");
    expect(users.status).toBe(403);
  });

  it("prevents deleting or demoting the last Active Admin", async () => {
    const { agent } = await login("admin", adminPassword);
    const admin = await prisma.user.findUnique({ where: { username: "admin" } });
    const demote = await agent
      .put(`/api/users/${admin.id}`)
      .set("X-Requested-With", "DaxGov")
      .send({
      role: "User",
      allowedPages: ["dashboard"],
    });
    expect(demote.status).toBe(400);
    const disable = await agent
      .post(`/api/users/${admin.id}/disable`)
      .set("X-Requested-With", "DaxGov");
    expect(disable.status).toBe(400);
    const remove = await agent
      .delete(`/api/users/${admin.id}`)
      .set("X-Requested-With", "DaxGov");
    expect(remove.status).toBe(400);
    const still = await prisma.user.findUnique({ where: { username: "admin" } });
    expect(still.role).toBe("Admin");
    expect(still.status).toBe("Active");
  });

  it("rejects cross-origin mutating requests and still accepts same-origin login", async () => {
    const blocked = await request(app)
      .post("/api/login")
      .set("Origin", "https://evil.example")
      .send({ username: "admin", password: adminPassword });
    expect(blocked.status).toBe(403);
    expect(blocked.body).toEqual({ error: FORBIDDEN });
    expect(blocked.headers["set-cookie"]).toBeUndefined();

    const allowed = await request(app)
      .post("/api/login")
      .set("Origin", "http://localhost:5173")
      .set("X-Requested-With", "DaxGov")
      .send({ username: "admin", password: adminPassword });
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.username).toBe("admin");

    const missingHeader = await request(app)
      .post("/api/login")
      .set("Origin", "http://localhost:5173")
      .send({ username: "admin", password: adminPassword });
    expect(missingHeader.status).toBe(403);
  });
});
