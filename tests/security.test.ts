import { describe, expect, it } from "vitest";
import {
  allowedOrigins,
  isAllowedRequestOrigin,
  isBlockedHostname,
  isPrivateIpAddress,
  jsonReviver,
} from "../server/security";
import { rateLimitControls } from "../server/rateLimits";

describe("outbound URL guards", () => {
  it("blocks loopback, link-local, and private addresses", () => {
    expect(isPrivateIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateIpAddress("10.0.0.8")).toBe(true);
    expect(isPrivateIpAddress("192.168.1.20")).toBe(true);
    expect(isPrivateIpAddress("169.254.169.254")).toBe(true);
    expect(isPrivateIpAddress("172.16.0.1")).toBe(true);
    expect(isPrivateIpAddress("8.8.8.8")).toBe(false);
  });

  it("blocks localhost and metadata hostnames", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("169.254.169.254")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("html.duckduckgo.com")).toBe(false);
  });
});

describe("request hardening helpers", () => {
  it("allows the local Vite and API origins by default", () => {
    const origins = allowedOrigins();
    expect(origins.has("http://localhost:5173")).toBe(true);
    expect(origins.has("http://localhost:5174")).toBe(true);
    expect(origins.has("https://evil.example")).toBe(false);
  });

  it("allows the browser origin when it matches the request host", () => {
    const req = {
      secure: true,
      headers: { "x-forwarded-proto": "https" },
      get(name: string) {
        if (name === "host") return "daxgov.example.com";
        return undefined;
      },
    } as any;
    expect(isAllowedRequestOrigin("https://daxgov.example.com", req)).toBe(true);
    expect(isAllowedRequestOrigin("https://evil.example", req)).toBe(false);
  });

  it("drops prototype-polluting JSON keys", () => {
    const parsed = JSON.parse(
      '{"assetName":"ok","__proto__":{"admin":true},"constructor":{"prototype":{"x":1}}}',
      jsonReviver,
    );
    expect(parsed.assetName).toBe("ok");
    expect(Object.prototype.hasOwnProperty.call(parsed, "__proto__")).toBe(
      false,
    );
    expect(parsed.admin).toBeUndefined();
  });
});

describe("rate-limit controls", () => {
  it("uses safe defaults and honors environment overrides", () => {
    const defaults = rateLimitControls();
    expect(defaults.login.limit).toBe(5);
    expect(defaults.login.windowMs).toBe(15 * 60 * 1000);
    expect(defaults.api.limit).toBe(300);
    expect(defaults.api.windowMs).toBe(60_000);
    expect(defaults.sso.limit).toBe(20);
    expect(defaults.passwordChange.limit).toBe(5);
    expect(defaults.accountLock.failures).toBe(8);
    const previous = process.env.API_RATE_LIMIT;
    process.env.API_RATE_LIMIT = "12";
    try {
      expect(rateLimitControls().api.limit).toBe(12);
    } finally {
      if (previous === undefined) delete process.env.API_RATE_LIMIT;
      else process.env.API_RATE_LIMIT = previous;
    }
  });
});
