import { afterEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";
import { requestLog, writeAppLog } from "../server/appLog";

describe("application logs", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes JSON lines to stdout for CloudWatch", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message) => {
      lines.push(String(message));
    });
    writeAppLog("info", "startup", { password: "secret", port: 8080 });
    expect(lines).toHaveLength(1);
    const payload = JSON.parse(lines[0]);
    expect(payload.event).toBe("startup");
    expect(payload.level).toBe("info");
    expect(payload.port).toBe(8080);
    expect(payload.password).toBe("[redacted]");
    expect(payload.timestamp).toEqual(expect.any(String));
  });

  it("logs API requests and skips health checks", async () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((message) => {
      lines.push(String(message));
    });
    const app = express();
    app.get("/health", (_req, res) => res.json({ status: "ok" }));
    app.use(requestLog());
    app.get("/api/ping", (_req, res) => res.json({ ok: true }));
    await request(app).get("/health").expect(200);
    await request(app).get("/api/ping").expect(200);
    const payloads = lines.map((line) => JSON.parse(line));
    expect(payloads).toHaveLength(1);
    expect(payloads[0]).toMatchObject({
      event: "http_request",
      method: "GET",
      path: "/api/ping",
      status: 200,
    });
  });
});
