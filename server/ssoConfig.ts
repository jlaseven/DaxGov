export const DEFAULT_JUMPCLOUD_ISSUER = "https://oauth.id.jumpcloud.com/";

export function jumpcloudIssuer() {
  const issuer = String(
    process.env.JUMPCLOUD_ISSUER || DEFAULT_JUMPCLOUD_ISSUER,
  ).trim();
  return issuer.endsWith("/") ? issuer : `${issuer}/`;
}

export function jumpcloudEnabled() {
  return Boolean(
    String(process.env.JUMPCLOUD_CLIENT_ID || "").trim() &&
      String(process.env.JUMPCLOUD_CLIENT_SECRET || "").trim(),
  );
}

export function passwordLoginEnabled() {
  if (!jumpcloudEnabled()) return true;
  const raw = String(process.env.JUMPCLOUD_DISABLE_PASSWORD || "").toLowerCase();
  return raw !== "1" && raw !== "true";
}

export function jumpcloudPublicConfig() {
  return {
    jumpcloud: jumpcloudEnabled(),
    passwordLogin: passwordLoginEnabled(),
  };
}

export function allowedEmailDomains() {
  return String(process.env.JUMPCLOUD_EMAIL_DOMAINS || "")
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
