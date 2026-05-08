import { prisma } from "./db/prisma.js";
import { hashPassword } from "./auth/password.js";

const email = process.env.SEED_EMAIL;
const password = process.env.SEED_PASSWORD;
const nome = process.env.SEED_NOME ?? null;

if (!email || !password) {
  throw new Error("Defina SEED_EMAIL e SEED_PASSWORD para executar o seed.");
}

const run = async () => {
  const count = await prisma.user.count();
  if (count > 0) {
    process.stdout.write("Seed ignorado: já existe usuário.\n");
    return;
  }

  await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      nome
    }
  });
  process.stdout.write("Usuário criado.\n");
};

await run().finally(async () => {
  await prisma.$disconnect();
});
