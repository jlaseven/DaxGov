import app, { prisma } from "./app.js";
import { ensureBootstrapAdmin } from "./auth.js";
import { ensureOrcaSeed } from "./orca.js";
import { ensureKriSeed } from "./kris.js";

const port = Number(process.env.PORT) || 5174;
const host = process.env.HOST || "localhost";

await ensureBootstrapAdmin(prisma);
await ensureOrcaSeed(prisma);
await ensureKriSeed(prisma);
app.listen(port, host, () =>
  console.log(`API listening at http://${host}:${port}`),
);
