import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireRole } from "../http/authMiddleware.js";

export const boletosEnviosRouter = Router();

const listSchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  take: z.coerce.number().int().min(1).max(500).default(100),
  skip: z.coerce.number().int().min(0).default(0)
});

boletosEnviosRouter.get("/", requireAuth, requireRole(["ADMIN", "COMERCIAL", "LEITURA"]), async (req, res) => {
  const query = listSchema.parse(req.query);
  const q = (query.q ?? "").trim().toLowerCase();
  const status = (query.status ?? "").trim();

  const conditions: Prisma.Sql[] = [];
  if (status) conditions.push(Prisma.sql`e.status = ${status}`);
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      Prisma.sql`(LOWER(e.arquivo) LIKE ${like} OR LOWER(COALESCE(c.nome, '')) LIKE ${like} OR LOWER(COALESCE(e.telefone, '')) LIKE ${like})`
    );
  }

  const whereSql = conditions.length ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}` : Prisma.sql``;

  const [countRows, items] = await Promise.all([
    prisma.$queryRaw<{ total: number }[]>(
      Prisma.sql`
        SELECT COUNT(*)::int as total
        FROM "BoletoEnvio" e
        LEFT JOIN "Cliente" c ON c.id = e."clienteId"
        ${whereSql}
      `
    ),
    prisma.$queryRaw<
      {
        id: string;
        arquivo: string;
        status: string;
        erro: string | null;
        tentativas: number;
        clienteId: string | null;
        clienteNome: string | null;
        telefone: string | null;
        createdAt: string;
        sentAt: string | null;
      }[]
    >(
      Prisma.sql`
        SELECT
          e.id,
          e.arquivo,
          e.status,
          e.erro,
          e.tentativas,
          e."clienteId" as "clienteId",
          c.nome as "clienteNome",
          e.telefone,
          e."createdAt"::text as "createdAt",
          e."sentAt"::text as "sentAt"
        FROM "BoletoEnvio" e
        LEFT JOIN "Cliente" c ON c.id = e."clienteId"
        ${whereSql}
        ORDER BY e."createdAt" DESC
        LIMIT ${query.take}
        OFFSET ${query.skip}
      `
    )
  ]);

  return res.json({ items, total: countRows[0]?.total ?? 0 });
});
