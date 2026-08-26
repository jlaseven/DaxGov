import { describe, expect, it } from "vitest";
import {
  allowedOrigins,
  isBlockedHostname,
  isPrivateIpAddress,
  jsonReviver,
} from "../server/security";

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
