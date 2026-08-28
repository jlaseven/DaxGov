import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import {
  isSpaAssetPath,
  registerSpaRoutes,
  shouldServeSpa,
  spaIndexPath,
} from "../server/spa";

const previous = {
  SERVE_SPA: process.env.SERVE_SPA,
  SPA_DIST: process.env.SPA_DIST,
  NODE_ENV: process.env.NODE_ENV,
};

afterEach(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("SPA serving", () => {
  it("treats hashed Vite asset paths as cacheable", () => {
    expect(isSpaAssetPath("/app/dist/assets/index-abc123.js")).toBe(true);
    expect(isSpaAssetPath("/app/dist/theme-boot.js")).toBe(false);
  });

  it("does not serve the SPA during tests unless explicitly enabled", () => {
    process.env.NODE_ENV = "test";
    delete process.env.SERVE_SPA;
    expect(shouldServeSpa()).toBe(false);
  });

  it("falls back to index.html for client routes and leaves /api and /health alone", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "daxgov-spa-"));
    try {
      await mkdir(path.join(dir, "assets"));
      await writeFile(
        path.join(dir, "index.html"),
        "<!doctype html><title>DaxGov SPA</title>",
      );
      await writeFile(path.join(dir, "assets", "app.js"), "console.log('ok')");
      process.env.SERVE_SPA = "true";
      process.env.SPA_DIST = dir;
      process.env.NODE_ENV = "test";
      expect(spaIndexPath()).toBe(path.join(dir, "index.html"));
      expect(shouldServeSpa()).toBe(true);

      const app = express();
      app.get("/health", (_req, res) => res.json({ status: "ok" }));
      app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
      registerSpaRoutes(app);

      await request(app).get("/health").expect(200, { status: "ok" });
      await request(app).get("/api/health").expect(200, { status: "ok" });
      const page = await request(app).get("/orca").expect(200);
      expect(page.text).toContain("DaxGov SPA");
      const asset = await request(app).get("/assets/app.js").expect(200);
      expect(asset.text).toContain("console.log");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
