import { afterEach, describe, expect, it } from "vitest";
import type { Profile } from "@node-saml/node-saml";
import {
  candidateUsernames,
  claimsFromSamlProfile,
  emailAllowedForSso,
  jumpcloudEnabled,
  jumpcloudOidcEnabled,
  jumpcloudPreferredProtocol,
  jumpcloudPublicConfig,
  jumpcloudSamlEnabled,
  normalizeSamlCertificate,
  passwordLoginEnabled,
} from "../server/ssoConfig";
import {
  createJumpCloudSaml,
  jumpcloudSamlCallbackUrl,
  jumpcloudSamlIssuer,
} from "../server/jumpcloudSaml";
import { isJumpCloudSamlAcs } from "../server/security";

const TEST_CERT = `-----BEGIN CERTIFICATE-----
MIICsjCCAZoCCQD0ipYR7MZfhzANBgkqhkiG9w0BAQsFADAbMRkwFwYDVQQDDBBk
YXhnb3Ytc2FtbC10ZXN0MB4XDTI2MDgyNjA3MDAxOFoXDTM2MDgyMzA3MDAxOFow
GzEZMBcGA1UEAwwQZGF4Z292LXNhbWwtdGVzdDCCASIwDQYJKoZIhvcNAQEBBQAD
ggEPADCCAQoCggEBAOMrIduw9JB9l8wMzkUOsloyhBywWgjGYrBXsBHL5lxDbqHD
TRUXL1eI26BmD47TvA5qFUJtKKO/ayNb7tWhnTnvjvyZUBeogvbDZCyo1+70bfUo
For2OT+hwUMj95Bd1tZ78SoL9cKZ1EFfz6WIGO+l/mR1yj/uKlh48fKdGHCnS8yn
X0SDykIYtgmbxW55hnqK00yLpYW+pNY6wQkjgbP6ptgKjsJ3ke3OAp7bMS1aUEc7
0k/qERO43C51IQRVEL0bFoOAyI4PqFUI5mhOqbiQ2biBbny5xUeLqBaGrSmDf6EY
wBNfyeax5BcwgzRfV3FrHTwXODcovEXzayICRJUCAwEAATANBgkqhkiG9w0BAQsF
AAOCAQEA0c2PC/tW1w0JgsJ+3GRsaGxoJRQoZUM/H2JjchqpcIWPRQSTkr6G+2Vq
9NFCBe/OYposnLkRVmVBKQAbMTszHw6vbkQoEJPinoyOTY/RGJuyMa0ZtxToKdPF
1vcvhUKJDPjw8z/iNnkLXDGnSHL52123RDOw3g/NicJP5g5tZexusG9w+xgOzTe9
nceMlVaELWq+ygfGqc6tnUYgUZi7dOqxbGq7/ZaAN7ppj1TMRL+JByElIT1uyWPz
WEk/+i2DESI+JeAPAUn7epORHsFlEcTCL9cyVQZAdq2kw8C75ihdxvzsVfT+cwkH
gVVhokYeYPIrxcotWdIYmEVRZyV1Tw==
-----END CERTIFICATE-----`;

const keys = [
  "JUMPCLOUD_CLIENT_ID",
  "JUMPCLOUD_CLIENT_SECRET",
  "JUMPCLOUD_DISABLE_PASSWORD",
  "JUMPCLOUD_EMAIL_DOMAINS",
  "JUMPCLOUD_SSO_PROTOCOL",
  "JUMPCLOUD_SAML_ENTRYPOINT",
  "JUMPCLOUD_SAML_SSO_URL",
  "JUMPCLOUD_SAML_IDP_CERT",
  "JUMPCLOUD_SAML_CERT",
  "JUMPCLOUD_SAML_ISSUER",
  "JUMPCLOUD_SAML_CALLBACK_URL",
];

afterEach(() => {
  for (const key of keys) delete process.env[key];
});

function mockReq(host = "localhost:5173") {
  return {
    get(name: string) {
      if (name === "host") return host;
      return undefined;
    },
    secure: false,
    headers: {},
  } as any;
}

describe("JumpCloud readiness", () => {
  it("stays off until OIDC or SAML is configured", () => {
    expect(jumpcloudEnabled()).toBe(false);
    expect(jumpcloudOidcEnabled()).toBe(false);
    expect(jumpcloudSamlEnabled()).toBe(false);
    expect(passwordLoginEnabled()).toBe(true);
    expect(jumpcloudPublicConfig()).toEqual({
      jumpcloud: false,
      passwordLogin: true,
      protocol: null,
    });
  });

  it("turns on OIDC SSO without disabling local passwords by default", () => {
    process.env.JUMPCLOUD_CLIENT_ID = "client";
    process.env.JUMPCLOUD_CLIENT_SECRET = "secret";
    expect(jumpcloudEnabled()).toBe(true);
    expect(jumpcloudPreferredProtocol()).toBe("oidc");
    expect(passwordLoginEnabled()).toBe(true);
    process.env.JUMPCLOUD_DISABLE_PASSWORD = "true";
    expect(passwordLoginEnabled()).toBe(false);
  });

  it("turns on SAML SSO from JumpCloud entry point and IdP certificate", () => {
    process.env.JUMPCLOUD_SAML_ENTRYPOINT =
      "https://sso.jumpcloud.com/saml2/daxgov";
    process.env.JUMPCLOUD_SAML_IDP_CERT = TEST_CERT.replace(/\s+/g, "");
    expect(jumpcloudSamlEnabled()).toBe(true);
    expect(jumpcloudEnabled()).toBe(true);
    expect(jumpcloudPreferredProtocol()).toBe("saml");
    expect(jumpcloudPublicConfig()).toMatchObject({
      jumpcloud: true,
      protocol: "saml",
    });
  });

  it("prefers SAML when JUMPCLOUD_SSO_PROTOCOL is saml and both are set", () => {
    process.env.JUMPCLOUD_CLIENT_ID = "client";
    process.env.JUMPCLOUD_CLIENT_SECRET = "secret";
    process.env.JUMPCLOUD_SAML_SSO_URL =
      "https://sso.jumpcloud.com/saml2/daxgov";
    process.env.JUMPCLOUD_SAML_CERT = TEST_CERT;
    process.env.JUMPCLOUD_SSO_PROTOCOL = "saml";
    expect(jumpcloudPreferredProtocol()).toBe("saml");
  });

  it("wraps a raw JumpCloud certificate body as PEM", () => {
    const wrapped = normalizeSamlCertificate(
      TEST_CERT.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""),
    );
    expect(wrapped).toContain("BEGIN CERTIFICATE");
    expect(wrapped).toContain("END CERTIFICATE");
  });

  it("maps JumpCloud claims onto existing local usernames", () => {
    expect(
      candidateUsernames({
        preferred_username: "Royette.Miranda",
        email: "royette.miranda@pdax.ph",
      }),
    ).toEqual(["royette.miranda", "royette.miranda@pdax.ph"]);
  });

  it("maps JumpCloud SAML attributes onto the same username matching", () => {
    const claims = claimsFromSamlProfile({
      issuer: "https://sso.jumpcloud.com/saml2/daxgov",
      nameID: "royette.miranda@pdax.ph",
      nameIDFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      email: "royette.miranda@pdax.ph",
      username: "Royette.Miranda",
    } as Profile);
    expect(claims).toMatchObject({
      email: "royette.miranda@pdax.ph",
      preferred_username: "Royette.Miranda",
    });
    expect(candidateUsernames(claims)).toEqual([
      "royette.miranda",
      "royette.miranda@pdax.ph",
    ]);
  });

  it("can restrict SSO emails to a company domain", () => {
    process.env.JUMPCLOUD_EMAIL_DOMAINS = "pdax.ph";
    expect(emailAllowedForSso("royette.miranda@pdax.ph")).toBe(true);
    expect(emailAllowedForSso("someone@gmail.com")).toBe(false);
  });

  it("builds JumpCloud SP ACS and metadata URLs for paste-in setup", () => {
    process.env.JUMPCLOUD_SAML_ENTRYPOINT =
      "https://sso.jumpcloud.com/saml2/daxgov";
    process.env.JUMPCLOUD_SAML_IDP_CERT = TEST_CERT;
    const req = mockReq("governance.pdax.ph");
    expect(jumpcloudSamlCallbackUrl(req)).toBe(
      "http://governance.pdax.ph/api/auth/jumpcloud/saml/acs",
    );
    expect(jumpcloudSamlIssuer(req)).toBe(
      "http://governance.pdax.ph/api/auth/jumpcloud/saml/metadata",
    );
    const xml = createJumpCloudSaml(req).generateServiceProviderMetadata(null);
    expect(xml).toContain("EntityDescriptor");
    expect(xml).toContain("/api/auth/jumpcloud/saml/acs");
    expect(xml).toContain("SPSSODescriptor");
  });

  it("treats the SAML ACS POST as a public IdP callback", () => {
    expect(
      isJumpCloudSamlAcs({
        method: "POST",
        originalUrl: "/api/auth/jumpcloud/saml/acs",
      } as any),
    ).toBe(true);
    expect(
      isJumpCloudSamlAcs({
        method: "GET",
        originalUrl: "/api/auth/jumpcloud/saml/acs",
      } as any),
    ).toBe(false);
    expect(
      isJumpCloudSamlAcs({
        method: "POST",
        originalUrl: "/api/login",
      } as any),
    ).toBe(false);
  });
});
