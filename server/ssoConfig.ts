import { existsSync, readFileSync } from "node:fs";
import type { Profile } from "@node-saml/node-saml";

export const DEFAULT_JUMPCLOUD_ISSUER = "https://oauth.id.jumpcloud.com/";

function env(name: string) {
  return String(process.env[name] || "").trim();
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = env(name);
    if (value) return value;
  }
  return "";
}

export function jumpcloudIssuer() {
  const issuer = env("JUMPCLOUD_ISSUER") || DEFAULT_JUMPCLOUD_ISSUER;
  return issuer.endsWith("/") ? issuer : `${issuer}/`;
}

export function jumpcloudOidcEnabled() {
  return Boolean(env("JUMPCLOUD_CLIENT_ID") && env("JUMPCLOUD_CLIENT_SECRET"));
}

export function normalizeSamlCertificate(value: string) {
  const cleaned = value.replace(/\\n/g, "\n").trim();
  if (!cleaned) return "";
  if (/BEGIN CERTIFICATE/.test(cleaned)) return cleaned;
  const body = cleaned.replace(/\s+/g, "");
  if (!body) return "";
  const lines = body.match(/.{1,64}/g)?.join("\n") || body;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}

export function jumpcloudSamlIdpCert() {
  const file = firstEnv(
    "JUMPCLOUD_SAML_IDP_CERT_FILE",
    "JUMPCLOUD_SAML_CERT_FILE",
  );
  const fromFile = file && existsSync(file) ? readFileSync(file, "utf8") : "";
  const raw =
    fromFile ||
    firstEnv("JUMPCLOUD_SAML_IDP_CERT", "JUMPCLOUD_SAML_CERT");
  return normalizeSamlCertificate(raw);
}

export function jumpcloudSamlEntrypoint() {
  return firstEnv(
    "JUMPCLOUD_SAML_ENTRYPOINT",
    "JUMPCLOUD_SAML_SSO_URL",
    "JUMPCLOUD_SAML_IDP_SSO_URL",
  );
}

export function jumpcloudSamlEnabled() {
  return Boolean(jumpcloudSamlEntrypoint() && jumpcloudSamlIdpCert());
}

export function jumpcloudEnabled() {
  return jumpcloudOidcEnabled() || jumpcloudSamlEnabled();
}

export type JumpCloudSsoProtocol = "oidc" | "saml";

export function jumpcloudPreferredProtocol(): JumpCloudSsoProtocol | null {
  const oidc = jumpcloudOidcEnabled();
  const saml = jumpcloudSamlEnabled();
  if (!oidc && !saml) return null;
  const forced = env("JUMPCLOUD_SSO_PROTOCOL").toLowerCase();
  if (forced === "saml" && saml) return "saml";
  if ((forced === "oidc" || forced === "oauth" || forced === "openid") && oidc)
    return "oidc";
  if (saml && !oidc) return "saml";
  if (oidc && !saml) return "oidc";
  return "oidc";
}

export function passwordLoginEnabled() {
  if (!jumpcloudEnabled()) return true;
  const raw = env("JUMPCLOUD_DISABLE_PASSWORD").toLowerCase();
  return raw !== "1" && raw !== "true";
}

export function jumpcloudPublicConfig() {
  return {
    jumpcloud: jumpcloudEnabled(),
    passwordLogin: passwordLoginEnabled(),
    protocol: jumpcloudPreferredProtocol(),
  };
}

export function allowedEmailDomains() {
  return env("JUMPCLOUD_EMAIL_DOMAINS")
    .split(",")
    .map((value) => value.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function emailAllowedForSso(email: string | undefined) {
  const domains = allowedEmailDomains();
  if (!domains.length) return true;
  const value = String(email || "")
    .trim()
    .toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 1) return false;
  return domains.includes(value.slice(at + 1));
}

export type JumpCloudClaims = {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
};

export function candidateUsernames(claims: JumpCloudClaims) {
  const names: string[] = [];
  const push = (value: unknown) => {
    const next = String(value || "")
      .trim()
      .toLowerCase();
    if (!next || names.includes(next)) return;
    names.push(next);
  };
  push(claims.preferred_username);
  const email = String(claims.email || "")
    .trim()
    .toLowerCase();
  if (email.includes("@")) push(email.slice(0, email.indexOf("@")));
  push(email);
  return names;
}

function samlAttribute(
  profile: Profile,
  names: string[],
): string | undefined {
  for (const name of names) {
    const value = profile[name];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find(
        (item) => typeof item === "string" && item.trim(),
      );
      if (typeof first === "string") return first.trim();
    }
  }
  return undefined;
}

export function claimsFromSamlProfile(profile: Profile): JumpCloudClaims {
  const nameId = String(profile.nameID || "").trim();
  const email = samlAttribute(profile, [
    "email",
    "mail",
    "Email",
    "emailaddress",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
    "http://schemas.xmlsoap.org/claims/EmailAddress",
    "urn:oid:0.9.2342.19200300.100.1.3",
  ]);
  const preferred = samlAttribute(profile, [
    "username",
    "Username",
    "preferred_username",
    "uid",
    "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
    "http://schemas.xmlsoap.org/claims/CommonName",
  ]);
  return {
    sub: nameId || undefined,
    email: email || (nameId.includes("@") ? nameId : undefined),
    name: samlAttribute(profile, ["name", "displayName", "cn"]),
    preferred_username: preferred || nameId || undefined,
  };
}

export function jumpcloudSamlIdpEntityId() {
  return firstEnv("JUMPCLOUD_SAML_IDP_ENTITY_ID", "JUMPCLOUD_SAML_IDP_ISSUER");
}

export function envFlag(name: string, fallback: boolean) {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return fallback;
}
