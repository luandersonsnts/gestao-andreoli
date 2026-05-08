import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { signAccessToken } from "../auth/jwt.js";
import { hashPassword, verifyPassword } from "../auth/password.js";
import { bootstrapSchema, loginSchema } from "../domain/schemas.js";
import { requireAuth } from "../http/authMiddleware.js";
import { getEnv } from "../config/env.js";

export const authRouter = Router();

authRouter.post("/bootstrap", async (req, res, next) => {
  try {
    const input = bootstrapSchema.parse(req.body);
    const count = await prisma.user.count();
    if (count > 0) {
      return res.status(409).json({ message: "Bootstrap já foi realizado" });
    }

    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password),
        nome: input.nome ?? null,
        role: "ADMIN"
      },
      select: { id: true, email: true, nome: true, role: true, createdAt: true }
    });

    const token = signAccessToken({ sub: user.id, email: user.email });
    return res.status(201).json({ user, token });
  } catch (err) {
    return next(err);
  }
});

authRouter.post("/login", async (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase() }
    });
    if (!user) {
      return res.status(401).json({ message: "E-mail ou senha incorretos" });
    }
    if (!user.active) {
      return res.status(401).json({ message: "Usuário desativado" });
    }

    const ok = await verifyPassword(input.password, user.passwordHash);
    if (!ok) {
      return res.status(401).json({ message: "E-mail ou senha incorretos" });
    }

    const token = signAccessToken({ sub: user.id, email: user.email });
    return res.json({
      user: { id: user.id, email: user.email, nome: user.nome, role: user.role },
      token
    });
  } catch (err) {
    return next(err);
  }
});

authRouter.post("/reset-password", async (req, res, next) => {
  try {
    const env = getEnv();
    if (!env.PASSWORD_RESET_CODE) {
      return res.status(501).json({ message: "Recuperação de senha não habilitada" });
    }

    const input = z
      .object({
        email: z.string().email(),
        code: z.string().min(1),
        password: z.string().min(8)
      })
      .parse(req.body);

    if (input.code !== env.PASSWORD_RESET_CODE) {
      return res.status(403).json({ message: "Código inválido" });
    }

    const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (!existing) return res.status(404).json({ message: "Usuário não encontrado" });

    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash: await hashPassword(input.password), active: true }
    });
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ message: "Não autenticado" });
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, nome: true, role: true, active: true, createdAt: true }
  });
  if (!user) return res.status(404).json({ message: "Usuário não encontrado" });
  if (!user.active) return res.status(401).json({ message: "Usuário desativado" });
  return res.json({ user });
});
