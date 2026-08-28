import net from "node:net";
import dns from "node:dns/promises";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import { FILE_BACKUP_UNSUPPORTED } from "./database.js";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.",
  "metadata.google.internal",
  "metadata.google.internal.",
  "kubernetes.default",
  "kubernetes.default.svc",
]);

export const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
];

export function allowedOrigins() {
  const extra = String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...extra]);
}

export function isPrivateIpAddress(ip: string) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1" || lower === "::") return true;
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
    if (lower.startsWith("fe80:")) return true;
    if (lower.startsWith("::ffff:"))
      return isPrivateIpAddress(ip.slice(ip.lastIndexOf(":") + 1));
    return false;
  }
  return true;
}

export function isBlockedHostname(hostname: string) {
  const host = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (!host) return true;
  if (BLOCKED_HOSTS.has(host) || BLOCKED_HOSTS.has(`${host}.`)) return true;
  if (host.endsWith(".localhost") || host.endsWith(".internal")) return true;
  if (host.endsWith(".local")) return true;
  if (net.isIP(host)) return isPrivateIpAddress(host);
  return false;
}

export async function assertSafeOutboundUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only HTTP and HTTPS URLs are allowed");
  if (url.protocol === "http:" && url.hostname !== "html.duckduckgo.com")
    throw new Error("Only HTTPS URLs are allowed");
  if (url.username || url.password)
    throw new Error("URLs with credentials are not allowed");
  if (isBlockedHostname(url.hostname))
    throw new Error("That address is not allowed");
  const lookedUp = await dns.lookup(url.hostname, { all: true });
  if (!lookedUp.length) throw new Error("That address is not allowed");
  for (const record of lookedUp) {
    if (isPrivateIpAddress(record.address))
      throw new Error("That address is not allowed");
  }
  return lookedUp;
}

export const MAX_PUBLIC_FETCH_BYTES = 512 * 1024;

export async function readLimitedText(
  response: globalThis.Response,
  maxBytes = MAX_PUBLIC_FETCH_BYTES,
) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > maxBytes) throw new Error("Remote page is too large");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes)
    return buffer.subarray(0, maxBytes).toString("utf8");
  return buffer.toString("utf8");
}

export async function fetchPublicHttp(
  url: string,
  init: globalThis.RequestInit = {},
  hops = 0,
): Promise<globalThis.Response> {
  if (hops > 3) throw new Error("Too many redirects");
  await assertSafeOutboundUrl(url);
  const response = await fetch(url, { ...init, redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("Redirect without a location");
    return fetchPublicHttp(new URL(location, url).toString(), init, hops + 1);
  }
  return response;
}

export function jsonReviver(key: string, value: unknown) {
  if (key === "__proto__" || key === "prototype" || key === "constructor")
    return undefined;
  return value;
}

const helmetBase = {
  crossOriginEmbedderPolicy: false as const,
  crossOriginOpenerPolicy: { policy: "same-origin" as const },
  crossOriginResourcePolicy: { policy: "same-origin" as const },
  referrerPolicy: { policy: "no-referrer" as const },
  frameguard: { action: "deny" as const },
  noSniff: true,
  hidePoweredBy: true,
  hsts: false as const,
  ieNoOpen: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: "none" as const },
  dnsPrefetchControl: { allow: false },
  xXssProtection: false as const,
};

const apiHelmet = helmet({
  ...helmetBase,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
    },
  },
});

const spaHelmet = helmet({
  ...helmetBase,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
});

export function helmetMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api") || req.path === "/health")
      return apiHelmet(req, res, next);
    return spaHelmet(req, res, next);
  };
}

export function applyTrustProxy(app: { set: (key: string, value: unknown) => void }) {
  const value = String(process.env.TRUST_PROXY || "").toLowerCase();
  if (value === "1" || value === "true") app.set("trust proxy", 1);
}

export function isHttpsRequest(req: Request) {
  const forced = String(process.env.COOKIE_SECURE || "").toLowerCase();
  if (forced === "1" || forced === "true") return true;
  if (forced === "0" || forced === "false") return false;
  return Boolean(req.secure || req.headers["x-forwarded-proto"] === "https");
}

export function requestOrigin(req: Request) {
  const host = String(
    req.get("x-forwarded-host") || req.get("host") || "localhost:5173",
  )
    .split(",")[0]
    .trim();
  const proto = isHttpsRequest(req) ? "https" : "http";
  return `${proto}://${host}`;
}

export function isAllowedRequestOrigin(origin: string, req: Request) {
  if (allowedOrigins().has(origin)) return true;
  return origin === requestOrigin(req);
}

export function isJumpCloudSamlAcs(req: Request) {
  if (req.method !== "POST") return false;
  const path = String(req.originalUrl || req.url || "")
    .split("?")[0]
    .replace(/\/+$/, "");
  return (
    path === "/api/auth/jumpcloud/saml/acs" ||
    path === "/auth/jumpcloud/saml/acs"
  );
}

export function rejectForeignOrigins() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!MUTATING.has(req.method)) return next();
    if (isJumpCloudSamlAcs(req)) return next();
    const origin = req.headers.origin;
    if (!origin) return next();
    if (isAllowedRequestOrigin(origin, req)) return next();
    return res.status(403).json({ error: "Forbidden" });
  };
}

export const REQUESTED_WITH = "DaxGov";

export function requireRequestedWith() {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!MUTATING.has(req.method)) return next();
    if (isJumpCloudSamlAcs(req)) return next();
    if (String(req.headers["x-requested-with"] || "") !== REQUESTED_WITH)
      return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

export function noStoreApi() {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    if (isHttpsRequest(_req)) {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=15552000; includeSubDomains",
      );
    }
    next();
  };
}

export function clientErrorMessage(error: unknown) {
  if (error instanceof Error) {
    if (
      error.message === "The selected file is not a SQLite database" ||
      error.message === "Backup file name is not allowed" ||
      error.message === FILE_BACKUP_UNSUPPORTED ||
      error.message === "Select an .xlsx ISRA workbook." ||
      error.message === "The selected workbook is empty." ||
      error.message === "The workbook is larger than the 8 MB limit." ||
      error.message.startsWith("No compatible ISRA") ||
      error.message.startsWith("No populated risk")
    )
      return error.message;
  }
  return null;
}
