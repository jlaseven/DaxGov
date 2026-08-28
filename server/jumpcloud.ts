import crypto from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { Express, Request, Response } from "express";
import type { LogFn } from "./activityLog.js";
import { createSession, destroySession, toAuthUser } from "./auth.js";
import { ssoRateLimiter } from "./rateLimits.js";
import { isHttpsRequest, requestOrigin } from "./security.js";
import {
  candidateUsernames,
  emailAllowedForSso,
  jumpcloudIssuer,
  jumpcloudOidcEnabled,
  jumpcloudPreferredProtocol,
  jumpcloudPublicConfig,
} from "./ssoConfig.js";
import {
  registerJumpCloudSamlRoutes,
  startJumpCloudSaml,
} from "./jumpcloudSaml.js";

export const JUMPCLOUD_STATE_COOKIE = "cybergov_oidc";
export {
  candidateUsernames,
  emailAllowedForSso,
  jumpcloudEnabled,
  jumpcloudIssuer,
  jumpcloudOidcEnabled,
  jumpcloudPreferredProtocol,
  jumpcloudPublicConfig,
  passwordLoginEnabled,
} from "./ssoConfig.js";
const STATE_TTL_MS = 10 * 60 * 1000;

type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  userinfo_endpoint?: string;
};

type OidcClaims = {
  sub?: string;
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nonce?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
};

type OidcState = {
  state: string;
  verifier: string;
  nonce: string;
  exp: number;
};

let discoveryCache: { issuer: string; document: OidcDiscovery; at: number } | null =
  null;

function base64Url(value: Buffer | string) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function base64UrlToBuffer(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  return Buffer.from(padded + "=".repeat((4 - (padded.length % 4)) % 4), "base64");
}

function stateSecret() {
  return (
    String(process.env.JUMPCLOUD_CLIENT_SECRET || "").trim() ||
    String(process.env.OIDC_STATE_SECRET || "").trim() ||
    "local-oidc-state"
  );
}

function signState(payload: OidcState) {
  const body = base64Url(JSON.stringify(payload));
  const mac = crypto
    .createHmac("sha256", stateSecret())
    .update(body)
    .digest();
  return `${body}.${base64Url(mac)}`;
}

function readState(value: string): OidcState | null {
  const [body, mac] = String(value || "").split(".");
  if (!body || !mac) return null;
  const expected = base64Url(
    crypto.createHmac("sha256", stateSecret()).update(body).digest(),
  );
  const left = Buffer.from(mac);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right))
    return null;
  try {
    const parsed = JSON.parse(base64UrlToBuffer(body).toString("utf8")) as OidcState;
    if (!parsed.state || !parsed.verifier || !parsed.nonce || !parsed.exp)
      return null;
    if (parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function stateCookieOptions(req: Request, maxAge = STATE_TTL_MS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isHttpsRequest(req),
    path: "/",
    maxAge,
  };
}

export function jumpcloudRedirectUri(req: Request) {
  const configured = String(process.env.JUMPCLOUD_REDIRECT_URI || "").trim();
  if (configured) return configured;
  return `${requestOrigin(req)}/api/auth/jumpcloud/callback`;
}

async function discovery(): Promise<OidcDiscovery> {
  const issuer = jumpcloudIssuer();
  if (
    discoveryCache &&
    discoveryCache.issuer === issuer &&
    Date.now() - discoveryCache.at < 60 * 60 * 1000
  )
    return discoveryCache.document;
  const wellKnown = new URL(".well-known/openid-configuration", issuer).toString();
  const response = await fetch(wellKnown);
  if (!response.ok)
    throw new Error(`JumpCloud discovery failed with HTTP ${response.status}`);
  const document = (await response.json()) as OidcDiscovery;
  if (
    !document.authorization_endpoint ||
    !document.token_endpoint ||
    !document.jwks_uri
  )
    throw new Error("JumpCloud discovery document is incomplete");
  discoveryCache = { issuer, document, at: Date.now() };
  return document;
}

async function verifyIdToken(idToken: string, nonce: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Invalid ID token");
  const header = JSON.parse(base64UrlToBuffer(parts[0]).toString("utf8")) as {
    kid?: string;
    alg?: string;
  };
  if (header.alg && header.alg !== "RS256")
    throw new Error("Unsupported ID token algorithm");
  const document = await discovery();
  const jwksResponse = await fetch(document.jwks_uri);
  if (!jwksResponse.ok) throw new Error("Unable to load JumpCloud signing keys");
  const jwks = (await jwksResponse.json()) as {
    keys: Array<crypto.JsonWebKey & { kid?: string }>;
  };
  const jwk =
    jwks.keys.find((key) => !header.kid || key.kid === header.kid) ||
    jwks.keys[0];
  if (!jwk) throw new Error("No JumpCloud signing key");
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const valid = crypto.verify(
    "sha256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    base64UrlToBuffer(parts[2]),
  );
  if (!valid) throw new Error("Invalid ID token signature");
  const claims = JSON.parse(
    base64UrlToBuffer(parts[1]).toString("utf8"),
  ) as OidcClaims;
  const issuer = jumpcloudIssuer().replace(/\/+$/, "");
  const tokenIssuer = String(claims.iss || "").replace(/\/+$/, "");
  if (tokenIssuer !== issuer) throw new Error("Unexpected ID token issuer");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes(String(process.env.JUMPCLOUD_CLIENT_ID || "").trim()))
    throw new Error("Unexpected ID token audience");
  if (Number(claims.exp || 0) * 1000 <= Date.now())
    throw new Error("ID token expired");
  if (claims.nonce && claims.nonce !== nonce)
    throw new Error("ID token nonce mismatch");
  return claims;
}

export async function findUserForJumpCloudClaims(
  prisma: PrismaClient,
  claims: OidcClaims,
) {
  if (!emailAllowedForSso(claims.email)) return null;
  for (const username of candidateUsernames(claims)) {
    const user = await prisma.user.findUnique({ where: { username } });
    if (user?.status === "Active") return toAuthUser(user);
  }
  return null;
}

function ssoErrorRedirect(code: string) {
  return `/?sso_error=${encodeURIComponent(code)}`;
}

function clearStateCookie(req: Request, res: Response) {
  res.clearCookie(JUMPCLOUD_STATE_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(req),
    path: "/",
  });
}

export function registerJumpCloudRoutes(
  app: Express,
  prisma: PrismaClient,
  log: LogFn,
) {
  const startLimiter = ssoRateLimiter();
  const callbackLimiter = ssoRateLimiter();

  app.get("/api/auth/sso", (_req, res) => {
    res.json({ data: jumpcloudPublicConfig() });
  });

  app.get("/api/auth/jumpcloud", startLimiter, async (req, res, next) => {
    try {
      const protocol = jumpcloudPreferredProtocol();
      if (!protocol)
        return res.status(404).json({
          error: "JumpCloud single sign-on is not configured",
        });
      if (protocol === "saml") return startJumpCloudSaml(req, res);
      if (!jumpcloudOidcEnabled())
        return res.status(404).json({
          error: "JumpCloud single sign-on is not configured",
        });
      const document = await discovery();
      const verifier = base64Url(crypto.randomBytes(32));
      const challenge = base64Url(
        crypto.createHash("sha256").update(verifier).digest(),
      );
      const state = base64Url(crypto.randomBytes(24));
      const nonce = base64Url(crypto.randomBytes(24));
      res.cookie(
        JUMPCLOUD_STATE_COOKIE,
        signState({
          state,
          verifier,
          nonce,
          exp: Date.now() + STATE_TTL_MS,
        }),
        stateCookieOptions(req),
      );
      const url = new URL(document.authorization_endpoint);
      url.searchParams.set("response_type", "code");
      url.searchParams.set(
        "client_id",
        String(process.env.JUMPCLOUD_CLIENT_ID || "").trim(),
      );
      url.searchParams.set("redirect_uri", jumpcloudRedirectUri(req));
      url.searchParams.set("scope", "openid email profile");
      url.searchParams.set("state", state);
      url.searchParams.set("nonce", nonce);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      res.redirect(url.toString());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/auth/jumpcloud/callback", callbackLimiter, async (req, res, next) => {
    try {
      if (!jumpcloudOidcEnabled())
        return res.redirect(ssoErrorRedirect("not_configured"));
      if (req.query.error)
        return res.redirect(
          ssoErrorRedirect(
            String(req.query.error) === "access_denied" ? "denied" : "invalid",
          ),
        );
      const packed = String(req.cookies?.[JUMPCLOUD_STATE_COOKIE] || "");
      const pending = readState(packed);
      clearStateCookie(req, res);
      const code = String(req.query.code || "");
      const state = String(req.query.state || "");
      if (!pending || !code || pending.state !== state)
        return res.redirect(ssoErrorRedirect("invalid"));
      const document = await discovery();
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: jumpcloudRedirectUri(req),
        client_id: String(process.env.JUMPCLOUD_CLIENT_ID || "").trim(),
        client_secret: String(process.env.JUMPCLOUD_CLIENT_SECRET || "").trim(),
        code_verifier: pending.verifier,
      });
      const tokenResponse = await fetch(document.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!tokenResponse.ok)
        return res.redirect(ssoErrorRedirect("invalid"));
      const tokens = (await tokenResponse.json()) as { id_token?: string };
      if (!tokens.id_token) return res.redirect(ssoErrorRedirect("invalid"));
      const claims = await verifyIdToken(tokens.id_token, pending.nonce);
      const user = await findUserForJumpCloudClaims(prisma, claims);
      if (!user) {
        await log("auth", claims.email || "sso", "auth.login.sso.failure", null, {
          reason: "not_provisioned",
        }, {
          outcome: "failure",
          eventType: "auth",
          httpStatus: 403,
          targetName: String(claims.email || claims.preferred_username || ""),
        });
        return res.redirect(ssoErrorRedirect("not_provisioned"));
      }
      await destroySession(prisma, req, res);
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });
      await createSession(prisma, req, res, user.id);
      await log("auth", user.id, "auth.login.sso.success", null, {
        username: user.username,
        provider: "jumpcloud",
      }, {
        eventType: "auth",
        httpStatus: 200,
        targetName: user.username,
        actorId: String(user.id),
        actorUsername: user.username,
        actorRole: user.role,
      });
      res.redirect("/");
    } catch {
      res.redirect(ssoErrorRedirect("invalid"));
    }
  });

  registerJumpCloudSamlRoutes(app, prisma, log, findUserForJumpCloudClaims);
}
