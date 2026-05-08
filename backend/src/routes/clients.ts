import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { requireAuth, requireRole } from "../http/authMiddleware.js";
import { clienteCreateSchema, clienteUpdateSchema } from "../domain/schemas.js";
import { makeMulter } from "../upload/storage.js";
import { isClienteEmAtraso } from "../domain/payments.js";

export const clientsRouter = Router();
const upload = makeMulter();

const listQuerySchema = z.object({
  q: z.string().optional(),
  contemplado: z.enum(["sim", "nao"]).optional(),
  multiplasCotas: z.enum(["1", "true", "sim"]).optional(),
  semFoto: z.enum(["1", "true", "sim"]).optional(),
  contempladoSemFoto: z.enum(["1", "true", "sim"]).optional(),
  parcelasEmAberto: z.enum(["1", "true", "sim"]).optional(),
  take: z.coerce.number().int().min(1).max(200).default(20),
  skip: z.coerce.number().int().min(0).default(0)
});

async function decorateClients(clientes: Array<{ id: string; _count: { cotas: number } }>) {
  const ids = clientes.map((c) => c.id);
  if (ids.length === 0) {
    return {
      contemplacaoSet: new Set<string>(),
      contemplacaoCountByClienteId: new Map<string, number>(),
      atrasoSet: new Set<string>()
    };
  }

  const contemplacao = await prisma.cota.groupBy({
    by: ["clienteId"],
    where: { clienteId: { in: ids }, contemplado: true },
    _count: { _all: true }
  });
  const contemplacaoSet = new Set(contemplacao.map((g) => g.clienteId));
  const contemplacaoCountByClienteId = new Map(contemplacao.map((g) => [g.clienteId, g._count._all]));

  const cotas = await prisma.cota.findMany({
    where: { clienteId: { in: ids } },
    select: {
      clienteId: true,
      grupo: true,
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
  });
  const byCliente = new Map<string, typeof cotas>();
  for (const c of cotas) {
    const arr = byCliente.get(c.clienteId) ?? [];
    arr.push(c as any);
    byCliente.set(c.clienteId, arr as any);
  }
  const atrasoSet = new Set<string>();
  for (const id of ids) {
    const clientCotas = byCliente.get(id) ?? [];
    if (isClienteEmAtraso(clientCotas as any)) atrasoSet.add(id);
  }

  return { contemplacaoSet, contemplacaoCountByClienteId, atrasoSet };
}

async function getClienteExtrasById(ids: string[]) {
  const map = new Map<
    string,
    { id: string; telefone: string | null; active: boolean | null; pontuacaoRanking: number | null; categoria: string | null }
  >();
  if (ids.length === 0) return map;
  try {
    const rows = await prisma.$queryRaw<
      { id: string; telefone: string | null; active: boolean | null; pontuacaoRanking: number | null; categoria: string | null }[]
    >(
      Prisma.sql`
        SELECT id, telefone, active, "pontuacaoRanking" as "pontuacaoRanking", categoria
        FROM "Cliente"
        WHERE id IN (${Prisma.join(ids)})
      `
    );
    for (const r of rows) map.set(r.id, r);
  } catch {
    return map;
  }
  return map;
}

async function tryUpdateClienteExtras(id: string, input: any) {
  try {
    await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "Cliente"
        SET
          telefone = ${input.telefone ?? null},
          active = ${input.active ?? true},
          "pontuacaoRanking" = ${input.pontuacaoRanking ?? 0},
          categoria = ${input.categoria ?? "NORMAL"}
        WHERE id = ${id}
      `
    );
  } catch {
    return;
  }
}

clientsRouter.get("/", requireAuth, requireRole(["ADMIN", "COMERCIAL", "LEITURA"]), async (req, res, next) => {
  try {
    const query = listQuerySchema.parse(req.query);

    const where: any = {};
    if (query.q) where.nome = { contains: query.q, mode: "insensitive" };
    if (query.semFoto) where.fotoPath = null;
    if (query.contempladoSemFoto) {
      where.tirouFoto = false;
      where.cotas = { some: { contemplado: true } };
    } else if (query.contemplado === "sim") {
      where.cotas = { some: { contemplado: true } };
    } else if (query.contemplado === "nao") {
      where.cotas = { none: { contemplado: true } };
    }

    const needsVipFilter = Boolean(query.multiplasCotas);
    const needsAtrasoFilter = Boolean(query.parcelasEmAberto);

    const baseFindArgs = {
      where,
      orderBy: { updatedAt: "desc" as const },
      select: {
        id: true,
        nome: true,
        dataNascimento: true,
        fotoPath: true,
        tirouFoto: true,
        observacoes: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { cotas: true } }
      }
    };

    if (needsVipFilter || needsAtrasoFilter) {
      const all = await prisma.cliente.findMany(baseFindArgs);
      const { contemplacaoSet, contemplacaoCountByClienteId, atrasoSet } = await decorateClients(all);
      const filtered = all
        .filter((c) => (needsVipFilter ? c._count.cotas > 2 : true))
        .filter((c) => (needsAtrasoFilter ? atrasoSet.has(c.id) : true));
      const paged = filtered.slice(query.skip, query.skip + query.take);
      const extrasById = await getClienteExtrasById(paged.map((c) => c.id));
      const items = paged.map((c) => ({
        ...c,
        telefone: extrasById.get(c.id)?.telefone ?? null,
        active: extrasById.get(c.id)?.active ?? true,
        pontuacaoRanking: extrasById.get(c.id)?.pontuacaoRanking ?? 0,
        categoria: (extrasById.get(c.id)?.categoria as any) ?? "NORMAL",
        isVip: c._count.cotas > 2,
        contempladasCount: contemplacaoCountByClienteId.get(c.id) ?? 0,
        possuiContemplacao: contemplacaoSet.has(c.id),
        possuiParcelasEmAberto: atrasoSet.has(c.id)
      }));
      return res.json({ items, total: filtered.length });
    }

    const [total, clientes] = await Promise.all([
      prisma.cliente.count({ where }),
      prisma.cliente.findMany({ ...baseFindArgs, skip: query.skip, take: query.take })
    ]);

    const { contemplacaoSet, contemplacaoCountByClienteId, atrasoSet } = await decorateClients(clientes);
    const extrasById = await getClienteExtrasById(clientes.map((c) => c.id));
    const items = clientes.map((c) => ({
      ...c,
      telefone: extrasById.get(c.id)?.telefone ?? null,
      active: extrasById.get(c.id)?.active ?? true,
      pontuacaoRanking: extrasById.get(c.id)?.pontuacaoRanking ?? 0,
      categoria: (extrasById.get(c.id)?.categoria as any) ?? "NORMAL",
      isVip: c._count.cotas > 2,
      contempladasCount: contemplacaoCountByClienteId.get(c.id) ?? 0,
      possuiContemplacao: contemplacaoSet.has(c.id),
      possuiParcelasEmAberto: atrasoSet.has(c.id)
    }));

    return res.json({ items, total });
  } catch (err) {
    return next(err);
  }
});

clientsRouter.get("/:id", requireAuth, requireRole(["ADMIN", "COMERCIAL", "LEITURA"]), async (req, res) => {
  const id = String(req.params.id);
  const cliente = await prisma.cliente.findUnique({
    where: { id },
    include: { cotas: { orderBy: { dataEntrada: "desc" } } }
  });
  if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" });
  const [extrasById, cotaCount] = await Promise.all([getClienteExtrasById([id]), prisma.cota.count({ where: { clienteId: id } })]);
  const extras = extrasById.get(id);
  return res.json({
    cliente: {
      ...(cliente as any),
      telefone: extras?.telefone ?? null,
      active: extras?.active ?? true,
      pontuacaoRanking: extras?.pontuacaoRanking ?? 0,
      categoria: (extras?.categoria as any) ?? "NORMAL"
    },
    isVip: cotaCount > 2
  });
});

clientsRouter.post("/", requireAuth, requireRole(["ADMIN", "COMERCIAL"]), async (req, res, next) => {
  try {
    const input = clienteCreateSchema.parse(req.body);
    const cliente = await prisma.cliente.create({
      data: {
        nome: input.nome,
        dataNascimento: input.dataNascimento ?? null,
        tirouFoto: input.tirouFoto,
        observacoes: input.observacoes ?? null,
        cotas: {
          create: input.cotas.map((c) => ({
            grupo: c.grupo,
            cota: c.cota,
            dataEntrada: c.dataEntrada,
            administradora: c.administradora,
            assembleiaDia: c.assembleiaDia ?? null,
            vencimentoDiaMensal: c.vencimentoDiaMensal ?? null,
            antecedenciaPrimeiraParcelaDias: c.antecedenciaPrimeiraParcelaDias ?? null,
            contemplado: c.contemplado,
            parcelaContemplacao: c.parcelaContemplacao ?? null,
            dataContemplacao: c.dataContemplacao ?? null,
            parcela1: c.parcela1 ?? null,
            parcela2: c.parcela2 ?? null,
            parcela3: c.parcela3 ?? null,
            parcela4: c.parcela4 ?? null,
            parcela5: c.parcela5 ?? null
          }))
        }
      },
      include: { cotas: true }
    });
    await tryUpdateClienteExtras(cliente.id, input);
    const cotaCount = Array.isArray((cliente as any).cotas) ? (cliente as any).cotas.length : await prisma.cota.count({ where: { clienteId: cliente.id } });
    const extrasById = await getClienteExtrasById([cliente.id]);
    const extras = extrasById.get(cliente.id);
    return res.status(201).json({
      cliente: {
        ...(cliente as any),
        telefone: extras?.telefone ?? input.telefone ?? null,
        active: extras?.active ?? input.active ?? true,
        pontuacaoRanking: extras?.pontuacaoRanking ?? input.pontuacaoRanking ?? 0,
        categoria: (extras?.categoria as any) ?? input.categoria ?? "NORMAL"
      },
      isVip: cotaCount > 2
    });
  } catch (err) {
    return next(err);
  }
});

clientsRouter.put("/:id", requireAuth, requireRole(["ADMIN", "COMERCIAL"]), async (req, res, next) => {
  try {
    const id = String(req.params.id);
    const input = clienteUpdateSchema.parse(req.body);
    const cliente = await prisma.$transaction(async (tx) => {
      const existing = await tx.cliente.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return null;
      await tx.cota.deleteMany({ where: { clienteId: id } });
      return tx.cliente.update({
        where: { id },
        data: {
          nome: input.nome,
          dataNascimento: input.dataNascimento ?? null,
          tirouFoto: input.tirouFoto,
          observacoes: input.observacoes ?? null,
          cotas: {
            create: input.cotas.map((c) => ({
              grupo: c.grupo,
              cota: c.cota,
              dataEntrada: c.dataEntrada,
              administradora: c.administradora,
              assembleiaDia: c.assembleiaDia ?? null,
              vencimentoDiaMensal: c.vencimentoDiaMensal ?? null,
              antecedenciaPrimeiraParcelaDias: c.antecedenciaPrimeiraParcelaDias ?? null,
              contemplado: c.contemplado,
              parcelaContemplacao: c.parcelaContemplacao ?? null,
              dataContemplacao: c.dataContemplacao ?? null,
              parcela1: c.parcela1 ?? null,
              parcela2: c.parcela2 ?? null,
              parcela3: c.parcela3 ?? null,
              parcela4: c.parcela4 ?? null,
              parcela5: c.parcela5 ?? null
            }))
          }
        },
        include: { cotas: true }
      });
    });

    if (!cliente) return res.status(404).json({ message: "Cliente não encontrado" });
    await tryUpdateClienteExtras(id, input);
    const [extrasById, cotaCount] = await Promise.all([getClienteExtrasById([id]), prisma.cota.count({ where: { clienteId: id } })]);
    const extras = extrasById.get(id);
    return res.json({
      cliente: {
        ...(cliente as any),
        telefone: extras?.telefone ?? input.telefone ?? null,
        active: extras?.active ?? input.active ?? true,
        pontuacaoRanking: extras?.pontuacaoRanking ?? input.pontuacaoRanking ?? 0,
        categoria: (extras?.categoria as any) ?? input.categoria ?? "NORMAL"
      },
      isVip: cotaCount > 2
    });
  } catch (err) {
    return next(err);
  }
});

clientsRouter.delete("/:id", requireAuth, requireRole(["ADMIN"]), async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.cliente.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: "Cliente não encontrado" });
  await prisma.cliente.delete({ where: { id } });
  return res.status(204).send();
});

clientsRouter.post(
  "/:id/photo",
  requireAuth,
  requireRole(["ADMIN", "COMERCIAL"]),
  upload.single("foto"),
  async (req, res) => {
  const id = String(req.params.id);
  const existing = await prisma.cliente.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return res.status(404).json({ message: "Cliente não encontrado" });
  if (!req.file) return res.status(400).json({ message: "Foto não enviada" });

  const fotoPath = `/uploads/${req.file.filename}`;
  const cliente = await prisma.cliente.update({
    where: { id },
    data: { fotoPath }
  });
  return res.json({ cliente });
  }
);
