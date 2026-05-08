import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireRole } from "../http/authMiddleware.js";
import { hashPassword } from "../auth/password.js";

export const usersRouter = Router();

usersRouter.use(requireAuth, requireRole(["ADMIN"]));

const roleSchema = z.enum(["ADMIN", "COMERCIAL", "LEITURA"]);

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, nome: true, role: true, active: true, createdAt: true, updatedAt: true }
  });
  return res.json({ users });
});

usersRouter.post("/", async (req, res, next) => {
  try {
    const input = z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        nome: z.string().min(1).nullable().optional(),
        role: roleSchema.default("COMERCIAL")
      })
      .parse(req.body);

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password),
        nome: input.nome ?? null,
        role: input.role
      },
      select: { id: true, email: true, nome: true, role: true, active: true, createdAt: true, updatedAt: true }
    });
    return res.status(201).json({ user });
  } catch (err) {
    return next(err);
  }
});

usersRouter.patch("/:id", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const input = z
      .object({
        nome: z.string().min(1).nullable().optional(),
        role: roleSchema.optional(),
        active: z.boolean().optional()
      })
      .parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return res.status(404).json({ message: "Usuário não encontrado" });

    const user = await prisma.user.update({
      where: { id },
      data: {
        nome: input.nome === undefined ? undefined : input.nome,
        role: input.role,
        active: input.active
      },
      select: { id: true, email: true, nome: true, role: true, active: true, createdAt: true, updatedAt: true }
    });
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
});

usersRouter.post("/:id/reset-password", async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const input = z.object({ password: z.string().min(8) }).parse(req.body);

    const existing = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return res.status(404).json({ message: "Usuário não encontrado" });

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await hashPassword(input.password) }
    });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

