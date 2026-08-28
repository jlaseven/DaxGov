import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDatabaseUrl, shouldApplyRemoteSchema } from "./secrets.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await resolveDatabaseUrl();

if (shouldApplyRemoteSchema()) {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  execFileSync(
    process.execPath,
    [prismaCli, "db", "push", "--skip-generate"],
    { stdio: "inherit", cwd: root, env: process.env },
  );
}

const { default: app, prisma } = await import("./app.js");
const { ensureBootstrapAdmin } = await import("./auth.js");
const { ensureOrcaSeed } = await import("./orca.js");
const { ensureKriSeed } = await import("./kris.js");

const port = Number(process.env.PORT) || 5174;
const host = process.env.HOST || "localhost";

await ensureBootstrapAdmin(prisma);
await ensureOrcaSeed(prisma);
await ensureKriSeed(prisma);
app.listen(port, host, () =>
  console.log(`DaxGov listening at http://${host}:${port}`),
);
