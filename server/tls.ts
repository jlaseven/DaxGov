import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import type { Express } from "express";
import type { Server } from "node:http";
import { writeAppLog } from "./appLog.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CERT_DAYS = 14;
const DEFAULT_ROTATE_EVERY_MS = 7 * DAY_MS;

export function tlsEnabled() {
  const value = String(process.env.TLS_ENABLED || "").toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function tlsCertDays() {
  const days = Number(process.env.TLS_CERT_DAYS);
  return Number.isFinite(days) && days > 0 ? Math.floor(days) : DEFAULT_CERT_DAYS;
}

export function tlsRotateEveryMs() {
  const ms = Number(process.env.TLS_ROTATE_EVERY_MS);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_ROTATE_EVERY_MS;
}

export function createSelfSignedTlsMaterial(commonName = "localhost") {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "daxgov-tls-"));
  const keyPath = path.join(dir, "key.pem");
  const certPath = path.join(dir, "cert.pem");
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-keyout",
        keyPath,
        "-out",
        certPath,
        "-days",
        String(tlsCertDays()),
        "-nodes",
        "-subj",
        `/CN=${commonName}`,
      ],
      { stdio: "pipe" },
    );
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function applyTlsMaterial(
  server: https.Server,
  material: { key: Buffer; cert: Buffer },
) {
  server.setSecureContext(material);
}

export function scheduleTlsRotation(server: https.Server, commonName: string) {
  const interval = setInterval(() => {
    try {
      applyTlsMaterial(server, createSelfSignedTlsMaterial(commonName));
      writeAppLog("info", "tls_rotated", {
        cert_days: tlsCertDays(),
        rotate_every_ms: tlsRotateEveryMs(),
      });
    } catch (error) {
      writeAppLog("error", "tls_rotate_failed", {
        message: error instanceof Error ? error.message : "rotation failed",
      });
    }
  }, tlsRotateEveryMs());
  interval.unref();
  return interval;
}

export function listenApp(app: Express, port: number, host: string): Server {
  if (!tlsEnabled()) {
    return app.listen(port, host, () =>
      writeAppLog("info", "startup", { url: `http://${host}:${port}`, tls: false }),
    );
  }
  const commonName = host || "localhost";
  const material = createSelfSignedTlsMaterial(commonName);
  const server = https.createServer(material, app);
  scheduleTlsRotation(server, commonName);
  return server.listen(port, host, () =>
    writeAppLog("info", "startup", {
      url: `https://${host}:${port}`,
      tls: true,
      cert_days: tlsCertDays(),
      rotate_every_ms: tlsRotateEveryMs(),
    }),
  );
}
