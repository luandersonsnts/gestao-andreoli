import "dotenv/config";
import { createApp } from "./app.js";
import { getEnv } from "./config/env.js";
import { prisma } from "./db/prisma.js";

const env = getEnv();

async function ensureHasAdmin() {
  const admins = await prisma.user.count({ where: { role: "ADMIN", active: true } });
  if (admins > 0) return;

  const oldest = await prisma.user.findFirst({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  if (!oldest) return;

  await prisma.user.update({ where: { id: oldest.id }, data: { role: "ADMIN" } });
}

await ensureHasAdmin();

const app = createApp();

app.listen(env.PORT, () => {
  process.stdout.write(`Andreoli Consultoria API em http://localhost:${env.PORT}\n`);
});
