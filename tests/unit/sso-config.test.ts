import { afterEach, describe, expect, it } from "vitest";
import {
  envFlag,
  jumpcloudIssuer,
  jumpcloudPreferredProtocol,
} from "../../server/ssoConfig";

describe("SSO config helpers", () => {
  const keys = [
    "JUMPCLOUD_ISSUER",
    "JUMPCLOUD_CLIENT_ID",
    "JUMPCLOUD_CLIENT_SECRET",
    "JUMPCLOUD_SSO_PROTOCOL",
    "FLAG_TEST",
  ];

  afterEach(() => {
    for (const key of keys) delete process.env[key];
  });

  it("normalizes the JumpCloud issuer with a trailing slash", () => {
    delete process.env.JUMPCLOUD_ISSUER;
    expect(jumpcloudIssuer()).toBe("https://oauth.id.jumpcloud.com/");
    process.env.JUMPCLOUD_ISSUER = "https://oauth.id.jumpcloud.com";
    expect(jumpcloudIssuer()).toBe("https://oauth.id.jumpcloud.com/");
  });

  it("reads boolean env flags with a fallback", () => {
    expect(envFlag("FLAG_TEST", true)).toBe(true);
    process.env.FLAG_TEST = "no";
    expect(envFlag("FLAG_TEST", true)).toBe(false);
    process.env.FLAG_TEST = "yes";
    expect(envFlag("FLAG_TEST", false)).toBe(true);
    process.env.FLAG_TEST = "maybe";
    expect(envFlag("FLAG_TEST", false)).toBe(false);
  });

  it("prefers OIDC when both protocols are available and none is forced", () => {
    process.env.JUMPCLOUD_CLIENT_ID = "client";
    process.env.JUMPCLOUD_CLIENT_SECRET = "secret";
    expect(jumpcloudPreferredProtocol()).toBe("oidc");
  });
});
