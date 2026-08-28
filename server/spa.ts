import { existsSync } from "node:fs";
import path from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import express from "express";

export function spaDistDir(cwd = process.cwd()) {
  const fromEnv = String(process.env.SPA_DIST || "").trim();
  return path.resolve(cwd, fromEnv || "dist");
}

export function spaIndexPath(cwd = process.cwd()) {
  return path.join(spaDistDir(cwd), "index.html");
}

export function shouldServeSpa(cwd = process.cwd()) {
  const flag = String(process.env.SERVE_SPA || "").toLowerCase();
  if (flag === "0" || flag === "false") return false;
  if (process.env.NODE_ENV === "test" && flag !== "1" && flag !== "true")
    return false;
  if (flag === "1" || flag === "true") return existsSync(spaIndexPath(cwd));
  if (process.env.NODE_ENV === "production") return existsSync(spaIndexPath(cwd));
  return false;
}

export function isSpaAssetPath(filePath: string) {
  return filePath.replaceAll("\\", "/").includes("/assets/");
}

function sendIndex(res: Response, indexFile: string, next: NextFunction) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.sendFile(indexFile, { dotfiles: "deny" }, (error) => {
    if (error) next(error);
  });
}

export function registerSpaRoutes(app: Express, cwd = process.cwd()) {
  if (!shouldServeSpa(cwd)) return false;
  const dist = spaDistDir(cwd);
  const indexFile = spaIndexPath(cwd);

  app.use(
    express.static(dist, {
      index: false,
      fallthrough: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith(`${path.sep}index.html`) || filePath.endsWith("/index.html")) {
          res.setHeader(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, private",
          );
          return;
        }
        if (isSpaAssetPath(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const urlPath = String(req.path || "");
    if (urlPath === "/health" || urlPath.startsWith("/api")) return next();
    if (path.extname(urlPath)) return next();
    sendIndex(res, indexFile, next);
  });

  return true;
}
