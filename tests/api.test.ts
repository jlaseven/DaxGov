import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GRANTABLE_PAGES, hashPassword, pagesJson } from "../server/auth";
import { createTestApi, loginAgent } from "./helpers/httpApp";

const adminPassword = "AdminPass-12x";
const userPassword = "UserPass-12xx";

describe("API HTTP", () => {
  let app: any;
  let prisma: any;
  let request: any;
  let cleanup: () => Promise<void>;
  let spaDir = "";

  async function login(username: string, password: string) {
    return loginAgent(request, app, username, password);
  }

  beforeAll(async () => {
    spaDir = path.join(os.tmpdir(), `daxgov-spa-${Date.now()}`);
    await mkdir(spaDir, { recursive: true });
    await writeFile(
      path.join(spaDir, "index.html"),
      "<!doctype html><title>DaxGov SPA</title><div id='root'></div>",
    );
    const api = await createTestApi({ serveSpa: true, spaDist: spaDir });
    app = api.app;
    prisma = api.prisma;
    request = api.request;
    cleanup = api.cleanup;
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
        username: "analyst",
        displayName: "Analyst",
        passwordHash: await hashPassword(userPassword),
        role: "User",
        status: "Active",
        allowedPages: pagesJson(["dashboard", "tpsa-monitoring"]),
      },
    });
  }, 60_000);

  afterAll(async () => {
    await cleanup?.();
  });

  it("serves live and API health checks without a session", async () => {
    const live = await request(app).get("/health");
    expect(live.status).toBe(200);
    expect(live.body).toEqual({ status: "ok" });
    const apiHealth = await request(app).get("/api/health");
    expect(apiHealth.status).toBe(200);
    expect(apiHealth.body).toEqual({ status: "ok" });
    expect(apiHealth.headers["cache-control"]).toMatch(/no-store/);
  });

  it("serves the SPA for client routes and keeps API JSON on /api", async () => {
    const page = await request(app).get("/orca");
    expect(page.status).toBe(200);
    expect(page.text).toContain("DaxGov SPA");
    const settings = await request(app).get("/settings");
    expect(settings.text).toContain("DaxGov SPA");
    const api = await request(app).get("/api/documents");
    expect(api.status).toBe(401);
    expect(api.body).toEqual({ error: "Authentication required" });
  });

  it("requires auth for dashboard and register APIs", async () => {
    const dashboard = await request(app).get("/api/dashboard");
    expect(dashboard.status).toBe(401);
    const documents = await request(app).get("/api/documents");
    expect(documents.status).toBe(401);
  });

  it("lets an Admin create, list, edit, and archive a governance document", async () => {
    const { agent, response } = await login("admin", adminPassword);
    expect(response.status).toBe(200);
    const created = await agent
      .post("/api/documents")
      .set("X-Requested-With", "DaxGov")
      .send({
        documentName: "Access Control Procedure",
        status: "Updated",
        cybersecurityPillar: "IAM",
        commentsRemarks: "Annual review",
      });
    expect(created.status).toBe(201);
    expect(created.body.data.documentName).toBe("Access Control Procedure");
    expect(created.body.data.id).toBeGreaterThan(0);

    const list = await agent.get("/api/documents");
    expect(list.status).toBe(200);
    expect(list.body.data.some((row: { documentName: string }) => row.documentName === "Access Control Procedure")).toBe(true);

    const updated = await agent
      .put(`/api/documents/${created.body.data.id}`)
      .set("X-Requested-With", "DaxGov")
      .send({
        documentName: "Access Control Procedure",
        status: "Currently Updating",
        cybersecurityPillar: "IAM",
      });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe("Currently Updating");

    const archived = await agent
      .post(`/api/documents/${created.body.data.id}/archive`)
      .set("X-Requested-With", "DaxGov");
    expect(archived.status).toBe(200);
    const active = await agent.get("/api/documents");
    expect(
      active.body.data.some((row: { id: number }) => row.id === created.body.data.id),
    ).toBe(false);
  });

  it("rejects invalid register payloads with a validation error", async () => {
    const { agent } = await login("admin", adminPassword);
    const response = await agent
      .post("/api/documents")
      .set("X-Requested-With", "DaxGov")
      .send({ documentName: "", status: "Updated", cybersecurityPillar: "IAM" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("returns dashboard KPIs for an authenticated Admin", async () => {
    const { agent } = await login("admin", adminPassword);
    const response = await agent.get("/api/dashboard");
    expect(response.status).toBe(200);
    expect(response.body.data.kpis).toEqual(
      expect.objectContaining({
        totalDocuments: expect.any(Number),
        totalTpsa: expect.any(Number),
        openOpir: expect.any(Number),
      }),
    );
    expect(response.body.data.charts).toBeDefined();
  });

  it("reports the local SQLite database on Settings", async () => {
    const { agent } = await login("admin", adminPassword);
    const settings = await agent.get("/api/settings/database");
    expect(settings.status).toBe(200);
    expect(settings.body.data.engine).toBe("sqlite");
    expect(settings.body.data.fileBackups).toBe(true);
    expect(settings.body.data.label).toBe("Local SQLite");
    expect(settings.body.data.snapshots).toEqual(expect.any(Array));
  });

  it("enforces page grants on register APIs", async () => {
    const { agent } = await login("analyst", userPassword);
    const tpsa = await agent.get("/api/tpsa-records");
    expect(tpsa.status).toBe(200);
    const documents = await agent.get("/api/documents");
    expect(documents.status).toBe(403);
    const create = await agent
      .post("/api/documents")
      .set("X-Requested-With", "DaxGov")
      .send({
        documentName: "Should not save",
        status: "Updated",
        cybersecurityPillar: "Governance",
      });
    expect(create.status).toBe(403);
    const backup = await agent
      .post("/api/settings/backup")
      .set("X-Requested-With", "DaxGov");
    expect(backup.status).toBe(403);
  });

  it("accepts same-origin SPA mutating requests from the published host", async () => {
    const response = await request(app)
      .post("/api/login")
      .set("Host", "daxgov.example.com")
      .set("X-Forwarded-Proto", "https")
      .set("Origin", "https://daxgov.example.com")
      .set("X-Requested-With", "DaxGov")
      .send({ username: "admin", password: adminPassword });
    expect(response.status).toBe(200);
    expect(response.body.data.username).toBe("admin");
  });
});
