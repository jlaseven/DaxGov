import type { NextFunction, Request, Response } from "express";

export type AppLogLevel = "info" | "warn" | "error";

const SECRET_KEY = /password|hash|token|secret|cookie|session/i;

export function writeAppLog(
  level: AppLogLevel,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(fields),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function requestLog() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!shouldLogRequest(req)) return next();
    const started = Date.now();
    res.on("finish", () => {
      const status = res.statusCode;
      writeAppLog(status >= 500 ? "error" : "info", "http_request", {
        method: req.method,
        path: req.path,
        status,
        duration_ms: Date.now() - started,
      });
    });
    next();
  };
}

function shouldLogRequest(req: Request) {
  const path = req.path || "";
  if (path === "/health") return false;
  if (path.startsWith("/assets/")) return false;
  if (path.startsWith("/api")) return true;
  return !/\.[a-z0-9]+$/i.test(path);
}

function sanitize(fields: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : value;
  }
  return out;
}
