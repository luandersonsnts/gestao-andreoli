import { z } from "zod";

const isoDateOrNull = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return v;
}, z.date().nullable());

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const bootstrapSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  nome: z.string().min(1).optional()
});

export const cotaInputSchema = z.object({
  grupo: z.string().min(1),
  cota: z.string().min(1),
  dataEntrada: isoDateOrNull.refine((d) => d !== null, { message: "dataEntrada é obrigatória" }).transform((d) => d as Date),
  administradora: z.string().min(1),
  assembleiaDia: z.number().int().min(1).max(31).nullable().optional(),
  vencimentoDiaMensal: z.number().int().min(1).max(31).nullable().optional(),
  antecedenciaPrimeiraParcelaDias: z.number().int().min(0).max(31).nullable().optional(),
  status: z.enum(["ativo", "inativo"]).optional().default("ativo"),
  contemplado: z.boolean().default(false),
  parcelaContemplacao: z.number().int().positive().nullable().optional(),
  dataContemplacao: isoDateOrNull.optional(),
  parcela1: isoDateOrNull.optional(),
  parcela2: isoDateOrNull.optional(),
  parcela3: isoDateOrNull.optional(),
  parcela4: isoDateOrNull.optional(),
  parcela5: isoDateOrNull.optional()
});

export const clienteCreateSchema = z.object({
  nome: z.string().min(1),
  telefone: z.string().min(8).max(20).nullable().optional(),
  active: z.boolean().optional().default(true),
  statusCliente: z.enum(["ativo", "desistente", "excluido"]).optional().default("ativo"),
  motivoDesistencia: z.string().nullable().optional(),
  dataDesistencia: isoDateOrNull.optional(),
  pontuacaoRanking: z.number().int().min(0).max(100000).optional().default(0),
  categoria: z.enum(["VIP", "NORMAL", "RISCO"]).optional().default("NORMAL"),
  dataNascimento: isoDateOrNull.optional(),
  tirouFoto: z.boolean().default(false),
  observacoes: z.string().nullable().optional(),
  cotas: z.array(cotaInputSchema).min(1)
});

export const clienteUpdateSchema = z.object({
  nome: z.string().min(1),
  telefone: z.string().min(8).max(20).nullable().optional(),
  active: z.boolean().optional().default(true),
  statusCliente: z.enum(["ativo", "desistente", "excluido"]).optional().default("ativo"),
  motivoDesistencia: z.string().nullable().optional(),
  dataDesistencia: isoDateOrNull.optional(),
  pontuacaoRanking: z.number().int().min(0).max(100000).optional().default(0),
  categoria: z.enum(["VIP", "NORMAL", "RISCO"]).optional().default("NORMAL"),
  dataNascimento: isoDateOrNull.optional(),
  tirouFoto: z.boolean().default(false),
  observacoes: z.string().nullable().optional(),
  cotas: z.array(cotaInputSchema).min(1)
});
