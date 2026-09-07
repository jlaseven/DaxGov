import { afterEach, describe, expect, it } from "vitest";
import { FILE_BACKUP_UNSUPPORTED } from "../../server/database";
import {
  applyTrustProxy,
  clientErrorMessage,
  isHttpsRequest,
  requestOrigin,
} from "../../server/security";

describe("HTTP security helpers", () => {
  const previous = {
    COOKIE_SECURE: process.env.COOKIE_SECURE,
    TRUST_PROXY: process.env.TRUST_PROXY,
  };

  afterEach(() => {
    restore("COOKIE_SECURE", previous.COOKIE_SECURE);
    restore("TRUST_PROXY", previous.TRUST_PROXY);
  });

  it("treats forwarded HTTPS and COOKIE_SECURE as secure requests", () => {
    delete process.env.COOKIE_SECURE;
    expect(
      isHttpsRequest({
        secure: false,
        headers: { "x-forwarded-proto": "https" },
      } as any),
    ).toBe(true);
    process.env.COOKIE_SECURE = "true";
    expect(
      isHttpsRequest({ secure: false, headers: {} } as any),
    ).toBe(true);
    process.env.COOKIE_SECURE = "false";
    expect(
      isHttpsRequest({
        secure: true,
        headers: { "x-forwarded-proto": "https" },
      } as any),
    ).toBe(false);
  });

  it("builds the request origin from host and protocol", () => {
    process.env.COOKIE_SECURE = "true";
    const req = {
      secure: false,
      headers: {},
      get(name: string) {
        if (name === "host") return "daxgov.example.com";
        return undefined;
      },
    } as any;
    expect(requestOrigin(req)).toBe("https://daxgov.example.com");
  });

  it("enables Express trust proxy from TRUST_PROXY", () => {
    const settings: Record<string, unknown> = {};
    process.env.TRUST_PROXY = "true";
    applyTrustProxy({
      set(key, value) {
        settings[key] = value;
      },
    });
    expect(settings["trust proxy"]).toBe(1);
  });

  it("returns only known client-safe error messages", () => {
    expect(clientErrorMessage(new Error(FILE_BACKUP_UNSUPPORTED))).toBe(
      FILE_BACKUP_UNSUPPORTED,
    );
    expect(
      clientErrorMessage(new Error("The selected file is not a SQLite database")),
    ).toBe("The selected file is not a SQLite database");
    expect(clientErrorMessage(new Error("secret stack"))).toBeNull();
    expect(clientErrorMessage("string")).toBeNull();
  });
});

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
