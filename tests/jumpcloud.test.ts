import { afterEach, describe, expect, it } from "vitest";
import {
  candidateUsernames,
  emailAllowedForSso,
  jumpcloudEnabled,
  jumpcloudPublicConfig,
  passwordLoginEnabled,
} from "../server/ssoConfig";

const keys = [
  "JUMPCLOUD_CLIENT_ID",
  "JUMPCLOUD_CLIENT_SECRET",
  "JUMPCLOUD_DISABLE_PASSWORD",
  "JUMPCLOUD_EMAIL_DOMAINS",
];

afterEach(() => {
  for (const key of keys) delete process.env[key];
});

describe("JumpCloud readiness", () => {
  it("stays off until client id and secret are set", () => {
    expect(jumpcloudEnabled()).toBe(false);
    expect(passwordLoginEnabled()).toBe(true);
    expect(jumpcloudPublicConfig()).toEqual({
      jumpcloud: false,
      passwordLogin: true,
    });
  });

  it("turns on SSO without disabling local passwords by default", () => {
    process.env.JUMPCLOUD_CLIENT_ID = "client";
    process.env.JUMPCLOUD_CLIENT_SECRET = "secret";
    expect(jumpcloudEnabled()).toBe(true);
    expect(passwordLoginEnabled()).toBe(true);
    process.env.JUMPCLOUD_DISABLE_PASSWORD = "true";
    expect(passwordLoginEnabled()).toBe(false);
  });

  it("maps JumpCloud claims onto existing local usernames", () => {
    expect(
      candidateUsernames({
        preferred_username: "Royette.Miranda",
        email: "royette.miranda@pdax.ph",
      }),
    ).toEqual(["royette.miranda", "royette.miranda@pdax.ph"]);
  });

  it("can restrict SSO emails to a company domain", () => {
    process.env.JUMPCLOUD_EMAIL_DOMAINS = "pdax.ph";
    expect(emailAllowedForSso("royette.miranda@pdax.ph")).toBe(true);
    expect(emailAllowedForSso("someone@gmail.com")).toBe(false);
  });
});
