import { afterEach, describe, expect, it, vi } from "vitest";
import https from "node:https";
import {
  createSelfSignedTlsMaterial,
  scheduleTlsRotation,
  tlsCertDays,
  tlsEnabled,
  tlsRotateEveryMs,
} from "../server/tls";

describe("tls helpers", () => {
  const previous = {
    enabled: process.env.TLS_ENABLED,
    days: process.env.TLS_CERT_DAYS,
    rotate: process.env.TLS_ROTATE_EVERY_MS,
  };

  afterEach(() => {
    restoreEnv("TLS_ENABLED", previous.enabled);
    restoreEnv("TLS_CERT_DAYS", previous.days);
    restoreEnv("TLS_ROTATE_EVERY_MS", previous.rotate);
    vi.restoreAllMocks();
  });

  it("is off unless TLS_ENABLED is truthy", () => {
    delete process.env.TLS_ENABLED;
    expect(tlsEnabled()).toBe(false);
    process.env.TLS_ENABLED = "true";
    expect(tlsEnabled()).toBe(true);
    process.env.TLS_ENABLED = "1";
    expect(tlsEnabled()).toBe(true);
    process.env.TLS_ENABLED = "no";
    expect(tlsEnabled()).toBe(false);
  });

  it("creates a self-signed PEM pair for the ALB backend hop", () => {
    const material = createSelfSignedTlsMaterial("daxgov.internal");
    expect(material.cert.toString()).toContain("BEGIN CERTIFICATE");
    expect(material.key.toString()).toContain("BEGIN PRIVATE KEY");
  });

  it("uses a short-lived cert lifetime and a rotation interval", () => {
    delete process.env.TLS_CERT_DAYS;
    delete process.env.TLS_ROTATE_EVERY_MS;
    expect(tlsCertDays()).toBe(14);
    expect(tlsRotateEveryMs()).toBe(7 * 24 * 60 * 60 * 1000);
    process.env.TLS_CERT_DAYS = "3";
    process.env.TLS_ROTATE_EVERY_MS = "1000";
    expect(tlsCertDays()).toBe(3);
    expect(tlsRotateEveryMs()).toBe(1000);
  });

  it("rotates the HTTPS server context on the interval", async () => {
    process.env.TLS_ROTATE_EVERY_MS = "80";
    const setSecureContext = vi.fn();
    const server = { setSecureContext } as unknown as https.Server;
    const timer = scheduleTlsRotation(server, "localhost");
    await new Promise((resolve) => setTimeout(resolve, 350));
    clearInterval(timer);
    expect(setSecureContext.mock.calls.length).toBeGreaterThanOrEqual(1);
    const material = setSecureContext.mock.calls[0][0];
    expect(material.cert.toString()).toContain("BEGIN CERTIFICATE");
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
