import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireRole } from "../http/authMiddleware.js";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", requireAuth, requireRole(["ADMIN", "COMERCIAL", "LEITURA"]), async (_req, res) => {
  const totalClientesPromise = prisma.cliente.count();

  const contempladosPromise = prisma.cota
    .groupBy({
      by: ["clienteId"],
      where: { contemplado: true }
    })
    .then((rows) => rows.length);

  const vipPromise = prisma.$queryRaw<{ count: bigint }[]>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM (
        SELECT "clienteId"
        FROM "Cota"
        GROUP BY "clienteId"
        HAVING COUNT(*) > 2
      ) t
    `
  );

  const tirouFotoPromise = prisma.cliente.count({ where: { tirouFoto: true } });
  const naoTirouFotoPromise = prisma.cliente.count({ where: { tirouFoto: false } });

  const [totalClientes, totalContemplados, vipRows, tirouFoto, naoTirouFoto] = await Promise.all([
    totalClientesPromise,
    contempladosPromise,
    vipPromise,
    tirouFotoPromise,
    naoTirouFotoPromise
  ]);

  const totalVip = Number(vipRows?.[0]?.count ?? 0n);
  const totalNaoContemplados = Math.max(0, totalClientes - totalContemplados);
  const taxaConversao = totalClientes === 0 ? 0 : totalContemplados / totalClientes;

  const entradasMensaisRows = await prisma.$queryRaw<{ mes: string; total: bigint }[]>(
    Prisma.sql`
      SELECT to_char(date_trunc('month', "dataEntrada"), 'YYYY-MM') AS mes,
             COUNT(*)::bigint AS total
      FROM "Cota"
      GROUP BY 1
      ORDER BY 1
    `
  );

  const administradorasRows = await prisma.$queryRaw<{ administradora: string; total: bigint }[]>(
    Prisma.sql`
      SELECT "administradora" AS administradora,
             COUNT(*)::bigint AS total
      FROM "Cota"
      GROUP BY 1
      ORDER BY 2 DESC, 1 ASC
    `
  );

  const cotasPorClienteRows = await prisma.$queryRaw<{ total: bigint }[]>(
    Prisma.sql`
      SELECT COUNT(*)::bigint AS total
      FROM "Cota"
      GROUP BY "clienteId"
    `
  );
  const buckets = { "1": 0, "2": 0, "3+": 0 };
  for (const r of cotasPorClienteRows) {
    const n = Number(r.total);
    if (n <= 1) buckets["1"] += 1;
    else if (n === 2) buckets["2"] += 1;
    else buckets["3+"] += 1;
  }

  return res.json({
    totals: {
      totalClientes,
      totalContemplados,
      totalNaoContemplados,
      totalVip,
      tirouFoto,
      naoTirouFoto,
      taxaConversao
    },
    charts: {
      contempladosVsNao: {
        labels: ["Contemplados", "Não contemplados"],
        values: [totalContemplados, totalNaoContemplados]
      },
      entradasMensais: {
        labels: entradasMensaisRows.map((r) => r.mes),
        values: entradasMensaisRows.map((r) => Number(r.total))
      },
      administradoras: {
        labels: administradorasRows.map((r) => r.administradora),
        values: administradorasRows.map((r) => Number(r.total))
      },
      clientesPorCotas: {
        labels: ["1", "2", "3+"],
        values: [buckets["1"], buckets["2"], buckets["3+"]]
      }
    }
  });
});
