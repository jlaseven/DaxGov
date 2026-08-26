import type { PrismaClient } from "@prisma/client";
import { SAML, ValidateInResponseTo } from "@node-saml/node-saml";
import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import type { LogFn } from "./activityLog.js";
import { createSession, destroySession, type AuthUser } from "./auth.js";
import { requestOrigin } from "./security.js";
import {
  claimsFromSamlProfile,
  envFlag,
  jumpcloudSamlEnabled,
  jumpcloudSamlEntrypoint,
  jumpcloudSamlIdpCert,
  jumpcloudSamlIdpEntityId,
  type JumpCloudClaims,
} from "./ssoConfig.js";

export const JUMPCLOUD_SAML_ACS_PATH = "/api/auth/jumpcloud/saml/acs";
export const JUMPCLOUD_SAML_METADATA_PATH =
  "/api/auth/jumpcloud/saml/metadata";
export const JUMPCLOUD_SAML_START_PATH = "/api/auth/jumpcloud/saml";

function ssoErrorRedirect(code: string) {
  return `/?sso_error=${encodeURIComponent(code)}`;
}

export function jumpcloudSamlCallbackUrl(req: Request) {
  const configured = String(
    process.env.JUMPCLOUD_SAML_CALLBACK_URL ||
      process.env.JUMPCLOUD_SAML_ACS_URL ||
      "",
  ).trim();
  if (configured) return configured;
  return `${requestOrigin(req)}${JUMPCLOUD_SAML_ACS_PATH}`;
}

export function jumpcloudSamlIssuer(req: Request) {
  const configured = String(
    process.env.JUMPCLOUD_SAML_ISSUER ||
      process.env.JUMPCLOUD_SAML_SP_ENTITY_ID ||
      "",
  ).trim();
  if (configured) return configured;
  return `${requestOrigin(req)}${JUMPCLOUD_SAML_METADATA_PATH}`;
}

export function createJumpCloudSaml(req: Request) {
  const idpCert = jumpcloudSamlIdpCert();
  const entryPoint = jumpcloudSamlEntrypoint();
  if (!idpCert || !entryPoint)
    throw new Error("JumpCloud SAML is not configured");
  const idpIssuer = jumpcloudSamlIdpEntityId() || undefined;
  return new SAML({
    callbackUrl: jumpcloudSamlCallbackUrl(req),
    entryPoint,
    issuer: jumpcloudSamlIssuer(req),
    idpCert,
    idpIssuer,
    audience: jumpcloudSamlIssuer(req),
    identifierFormat:
      "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    acceptedClockSkewMs: 5 * 60 * 1000,
    wantAssertionsSigned: envFlag("JUMPCLOUD_SAML_WANT_ASSERTIONS_SIGNED", true),
    wantAuthnResponseSigned: envFlag(
      "JUMPCLOUD_SAML_WANT_RESPONSE_SIGNED",
      false,
    ),
    validateInResponseTo: ValidateInResponseTo.ifPresent,
    disableRequestedAuthnContext: true,
  });
}

export async function startJumpCloudSaml(req: Request, res: Response) {
  if (!jumpcloudSamlEnabled()) {
    res.status(404).json({
      error: "JumpCloud SAML single sign-on is not configured",
    });
    return;
  }
  const saml = createJumpCloudSaml(req);
  const url = await saml.getAuthorizeUrlAsync("", undefined, {});
  res.redirect(url);
}

export function registerJumpCloudSamlRoutes(
  app: Express,
  prisma: PrismaClient,
  log: LogFn,
  findUser: (
    prisma: PrismaClient,
    claims: JumpCloudClaims,
  ) => Promise<AuthUser | null>,
) {
  const startLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many attempts. Try again later." },
    validate: false,
  });

  app.get(JUMPCLOUD_SAML_START_PATH, startLimiter, async (req, res, next) => {
    try {
      await startJumpCloudSaml(req, res);
    } catch (error) {
      next(error);
    }
  });

  app.get(JUMPCLOUD_SAML_METADATA_PATH, (req, res, next) => {
    try {
      if (!jumpcloudSamlEnabled())
        return res.status(404).json({
          error: "JumpCloud SAML single sign-on is not configured",
        });
      const xml = createJumpCloudSaml(req).generateServiceProviderMetadata(
        null,
      );
      res.setHeader("Content-Type", "application/samlmetadata+xml");
      res.send(xml);
    } catch (error) {
      next(error);
    }
  });

  app.post(
    JUMPCLOUD_SAML_ACS_PATH,
    express.urlencoded({ extended: false, limit: "1mb" }),
    async (req, res) => {
      try {
        if (!jumpcloudSamlEnabled())
          return res.redirect(ssoErrorRedirect("not_configured"));
        const samlResponse = String(req.body?.SAMLResponse || "");
        if (!samlResponse) return res.redirect(ssoErrorRedirect("invalid"));
        const saml = createJumpCloudSaml(req);
        const { profile, loggedOut } = await saml.validatePostResponseAsync({
          SAMLResponse: samlResponse,
          RelayState: String(req.body?.RelayState || ""),
        });
        if (loggedOut || !profile)
          return res.redirect(ssoErrorRedirect("invalid"));
        const claims = claimsFromSamlProfile(profile);
        const user = await findUser(prisma, claims);
        if (!user) {
          await log(
            "auth",
            claims.email || "sso",
            "auth.login.sso.failure",
            null,
            { reason: "not_provisioned", provider: "jumpcloud-saml" },
            {
              outcome: "failure",
              eventType: "auth",
              httpStatus: 403,
              targetName: String(
                claims.email || claims.preferred_username || "",
              ),
            },
          );
          return res.redirect(ssoErrorRedirect("not_provisioned"));
        }
        await destroySession(prisma, req, res);
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        await createSession(prisma, req, res, user.id);
        await log(
          "auth",
          user.id,
          "auth.login.sso.success",
          null,
          { username: user.username, provider: "jumpcloud-saml" },
          {
            eventType: "auth",
            httpStatus: 200,
            targetName: user.username,
            actorId: String(user.id),
            actorUsername: user.username,
            actorRole: user.role,
          },
        );
        res.redirect("/");
      } catch {
        res.redirect(ssoErrorRedirect("invalid"));
      }
    },
  );
}
