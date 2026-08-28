import type { Request } from "express";
import rateLimit from "express-rate-limit";

export const RATE_LIMIT_ERROR = "Too many attempts. Try again later.";
export const ACCOUNT_LOCK_AFTER = 8;
export const ACCOUNT_LOCK_MS = 15 * 60 * 1000;

function envInt(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export function loginWindowMs() {
  return envInt("LOGIN_WINDOW_MS", 15 * 60 * 1000);
}

export function loginMaxAttempts() {
  return envInt("LOGIN_MAX_ATTEMPTS", 5);
}

export function apiRateWindowMs() {
  return envInt("API_RATE_WINDOW_MS", 60_000);
}

export function apiRateLimit() {
  return envInt("API_RATE_LIMIT", 300);
}

export function ssoWindowMs() {
  return envInt("SSO_WINDOW_MS", 15 * 60 * 1000);
}

export function ssoMaxAttempts() {
  return envInt("SSO_MAX_ATTEMPTS", 20);
}

export function passwordChangeWindowMs() {
  return envInt("PASSWORD_CHANGE_WINDOW_MS", 15 * 60 * 1000);
}

export function passwordChangeMaxAttempts() {
  return envInt("PASSWORD_CHANGE_MAX_ATTEMPTS", 5);
}

const rateLimitMessage = { error: RATE_LIMIT_ERROR };

export function loginRateLimiter() {
  return rateLimit({
    windowMs: loginWindowMs(),
    limit: loginMaxAttempts(),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
    validate: false,
    keyGenerator: (req: Request) => {
      const username = String(
        (req.body as { username?: string } | undefined)?.username || "",
      )
        .trim()
        .toLowerCase();
      return `${req.ip || "127.0.0.1"}:${username}`;
    },
  });
}

export function apiRateLimiter() {
  return rateLimit({
    windowMs: apiRateWindowMs(),
    limit: apiRateLimit(),
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: rateLimitMessage,
    skip: (req: Request) => {
      const path = String(req.originalUrl || req.url || "").split("?")[0];
      return path === "/api/health" || path === "/health";
    },
  });
}

export function ssoRateLimiter() {
  return rateLimit({
    windowMs: ssoWindowMs(),
    limit: ssoMaxAttempts(),
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
    validate: false,
  });
}

export function passwordChangeRateLimiter() {
  return rateLimit({
    windowMs: passwordChangeWindowMs(),
    limit: passwordChangeMaxAttempts(),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: rateLimitMessage,
    validate: false,
  });
}

export function rateLimitControls() {
  return {
    api: { limit: apiRateLimit(), windowMs: apiRateWindowMs() },
    login: { limit: loginMaxAttempts(), windowMs: loginWindowMs() },
    sso: { limit: ssoMaxAttempts(), windowMs: ssoWindowMs() },
    passwordChange: {
      limit: passwordChangeMaxAttempts(),
      windowMs: passwordChangeWindowMs(),
    },
    accountLock: { failures: ACCOUNT_LOCK_AFTER, lockMs: ACCOUNT_LOCK_MS },
  };
}
