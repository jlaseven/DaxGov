import { afterEach, describe, expect, it } from "vitest";
import {
  accountLocked,
  apiPath,
  bcryptCost,
  clearLoginFailures,
  GRANTABLE_PAGES,
  mePayload,
  parseStoredPages,
  publicUser,
  recordLoginFailure,
  requestClientIp,
  requestUserAgent,
  userCanAccessPath,
  type AuthUser,
} from "../../server/auth";

function user(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 2,
    username: "analyst",
    displayName: "Analyst",
    role: "User",
    status: "Active",
    allowedPages: ["dashboard", "documents"],
    lastLoginAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("auth access helpers", () => {
  afterEach(() => {
    clearLoginFailures("lock.user");
    delete process.env.BCRYPT_COST;
  });

  it("clamps bcrypt cost to a safe range", () => {
    delete process.env.BCRYPT_COST;
    expect(bcryptCost()).toBe(12);
    process.env.BCRYPT_COST = "2";
    expect(bcryptCost()).toBe(4);
    process.env.BCRYPT_COST = "40";
    expect(bcryptCost()).toBe(15);
  });

  it("parses stored page JSON and ignores invalid payloads", () => {
    expect(parseStoredPages('["dashboard","documents"]')).toEqual([
      "dashboard",
      "documents",
    ]);
    expect(parseStoredPages("not-json")).toEqual([]);
  });

  it("strips /api from request paths", () => {
    expect(apiPath({ originalUrl: "/api/documents?page=1" } as any)).toBe(
      "/documents",
    );
    expect(apiPath({ url: "/health" } as any)).toBe("/health");
  });

  it("gives Admins every grantable page in the public user payload", () => {
    const admin = user({
      role: "Admin",
      username: "admin",
      allowedPages: ["dashboard"],
    });
    expect(publicUser(admin).allowedPages).toEqual([...GRANTABLE_PAGES]);
    expect(mePayload(admin, { mustChangePassword: true })).toMatchObject({
      isAdmin: true,
      mustChangePassword: true,
      researchEnabled: true,
    });
  });

  it("lets a User reach granted pages and blocks the rest", () => {
    const analyst = user();
    expect(userCanAccessPath(analyst, "GET", "/documents")).toBe(true);
    expect(userCanAccessPath(analyst, "GET", "/orca")).toBe(false);
    expect(userCanAccessPath(analyst, "GET", "/users")).toBe(false);
    expect(userCanAccessPath(analyst, "GET", "/me")).toBe(true);
    expect(userCanAccessPath(analyst, "POST", "/login")).toBe(true);
  });

  it("lets ISRA Assessment users reach DAXON questionnaire APIs", () => {
    const assessor = user({ allowedPages: ["isra-assessment"] });
    expect(userCanAccessPath(assessor, "GET", "/isra-spog")).toBe(false);
    expect(
      userCanAccessPath(assessor, "GET", "/isra-spog/assessments/12"),
    ).toBe(true);
    expect(userCanAccessPath(assessor, "POST", "/isra-spog/import")).toBe(true);
  });

  it("locks an account after repeated failed logins", () => {
    const now = Date.UTC(2026, 8, 7, 7, 0, 0);
    expect(accountLocked("lock.user", now)).toBe(false);
    for (let i = 0; i < 7; i += 1) recordLoginFailure("lock.user", now);
    expect(accountLocked("lock.user", now)).toBe(false);
    recordLoginFailure("lock.user", now);
    expect(accountLocked("lock.user", now)).toBe(true);
    expect(accountLocked("LOCK.USER", now + 1000)).toBe(true);
    clearLoginFailures("lock.user");
    expect(accountLocked("lock.user", now)).toBe(false);
  });

  it("captures a truncated client IP and User-Agent for session metadata", () => {
    expect(
      requestClientIp({
        ip: "::ffff:127.0.0.1",
        headers: {},
      } as any),
    ).toBe("127.0.0.1");
    expect(
      requestUserAgent({
        headers: { "user-agent": "Mozilla/5.0 DaxGov" },
      } as any),
    ).toBe("Mozilla/5.0 DaxGov");
    expect(
      requestUserAgent({
        headers: { "user-agent": "x".repeat(600) },
      } as any)?.length,
    ).toBe(512);
  });
});
