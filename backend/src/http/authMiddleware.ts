import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../auth/jwt.js";
import { prisma } from "../db/prisma.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const [type, token] = header.split(" ");
  if (type !== "Bearer" || !token) {
    return res.status(401).json({ message: "Não autenticado" });
  }

  try {
    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, active: true }
    });
    if (!user || !user.active) {
      return res.status(401).json({ message: "Não autenticado" });
    }
    req.user = { id: user.id, email: user.email, role: user.role };
    return next();
  } catch {
    return res.status(401).json({ message: "Token inválido" });
  }
}

export function requireRole(roles: Array<"ADMIN" | "COMERCIAL" | "LEITURA">) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role) return res.status(401).json({ message: "Não autenticado" });
    if (!roles.includes(role)) return res.status(403).json({ message: "Sem permissão" });
    return next();
  };
}
