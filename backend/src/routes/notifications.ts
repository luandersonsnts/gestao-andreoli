import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireRole } from "../http/authMiddleware.js";
import { getCotaAtrasoDetalhes, isClienteEmAtraso } from "../domain/payments.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", requireAuth, requireRole(["ADMIN", "COMERCIAL", "LEITURA"]), async (_req, res) => {
  const vipRows = await prisma.$queryRaw<{ id: string; nome: string }[]>(
    Prisma.sql`
      SELECT c.id, c.nome
      FROM "Cliente" c
      JOIN (
        SELECT "clienteId"
        FROM "Cota"
        WHERE status = 'ativo'
        GROUP BY "clienteId"
        HAVING COUNT(*) > 2
      ) t ON t."clienteId" = c.id
      WHERE c."statusCliente" = 'ativo'
      ORDER BY c.nome ASC
    `
  );

  const contempladoSemFoto = await prisma.cliente.findMany({
    where: { 
      tirouFoto: false, 
      statusCliente: "ativo",
      cotas: { some: { contemplado: true, status: "ativo" } } 
    },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" }
  });

  const clientesComCotas = await prisma.cliente.findMany({
    where: { statusCliente: "ativo" },
    select: {
      id: true,
      nome: true,
      cotas: {
        where: { status: "ativo" },
        select: {
          grupo: true,
          status: true,
          administradora: true,
          dataEntrada: true,
          assembleiaDia: true,
          vencimentoDiaMensal: true,
          antecedenciaPrimeiraParcelaDias: true,
          parcela1: true,
          parcela2: true,
          parcela3: true,
          parcela4: true,
          parcela5: true
        }
      }
    },
    orderBy: { nome: "asc" }
  });
  const parcelasEmAtraso = clientesComCotas
    .filter((c) => isClienteEmAtraso(c.cotas as any))
    .map((c) => {
      let cotasEmAtraso = 0;
      let parcelasEmAtrasoCount = 0;
      for (const cota of c.cotas as any[]) {
        const d = getCotaAtrasoDetalhes(cota as any);
        cotasEmAtraso += d.cotasEmAtraso;
        parcelasEmAtrasoCount += d.parcelasEmAtraso;
      }
      return { id: c.id, nome: c.nome, cotasEmAtraso, parcelasEmAtraso: parcelasEmAtrasoCount };
    });

  return res.json({
    alerts: [
      {
        key: "cliente_vip",
        title: "Cliente VIP (mais de 2 cotas)",
        count: vipRows.length,
        clientes: vipRows
      },
      {
        key: "contemplado_sem_foto",
        title: "Contemplado que não tirou foto",
        count: contempladoSemFoto.length,
        clientes: contempladoSemFoto
      },
      {
        key: "parcelas_em_atraso",
        title: "Parcelas em atraso",
        count: parcelasEmAtraso.length,
        clientes: parcelasEmAtraso
      }
    ]
  });
});
