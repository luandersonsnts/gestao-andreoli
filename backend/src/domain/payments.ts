import type { Cota } from "@prisma/client";

export type AdminRules = {
  assembleiaDiaDefault: number;
  antecedenciaPrimeiraParcelaDiasDefault: number;
  vencimentoDiaMensalDefault: number;
  vencimentoDiaMensalPorGrupo?: Record<string, number>;
};

const rulesByAdministradora: Record<string, AdminRules> = {
  gazin: {
    assembleiaDiaDefault: 17,
    antecedenciaPrimeiraParcelaDiasDefault: 1,
    vencimentoDiaMensalDefault: 10
  },
  tradição: {
    assembleiaDiaDefault: 17,
    antecedenciaPrimeiraParcelaDiasDefault: 3,
    vencimentoDiaMensalDefault: 10,
    vencimentoDiaMensalPorGrupo: {}
  },
  tradicao: {
    assembleiaDiaDefault: 17,
    antecedenciaPrimeiraParcelaDiasDefault: 3,
    vencimentoDiaMensalDefault: 10,
    vencimentoDiaMensalPorGrupo: {}
  }
};

function normalizeAdminName(name: string) {
  return name.trim().toLowerCase();
}

function daysInMonth(year: number, monthIndex0: number) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function safeDate(year: number, monthIndex0: number, day: number) {
  const dim = daysInMonth(year, monthIndex0);
  const d = Math.min(Math.max(1, day), dim);
  return new Date(year, monthIndex0, d, 0, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function getCotaRules(cota: Pick<Cota, "administradora" | "assembleiaDia" | "vencimentoDiaMensal" | "antecedenciaPrimeiraParcelaDias" | "grupo">) {
  const adminKey = normalizeAdminName(cota.administradora);
  const base = rulesByAdministradora[adminKey] ?? {
    assembleiaDiaDefault: 17,
    antecedenciaPrimeiraParcelaDiasDefault: 1,
    vencimentoDiaMensalDefault: 10,
    vencimentoDiaMensalPorGrupo: {}
  };

  const assembleiaDia = cota.assembleiaDia ?? base.assembleiaDiaDefault;
  const antecedenciaPrimeiraParcelaDias = cota.antecedenciaPrimeiraParcelaDias ?? base.antecedenciaPrimeiraParcelaDiasDefault;

  const byGroup = base.vencimentoDiaMensalPorGrupo?.[cota.grupo];
  const vencimentoDiaMensal = cota.vencimentoDiaMensal ?? byGroup ?? base.vencimentoDiaMensalDefault;

  return { assembleiaDia, antecedenciaPrimeiraParcelaDias, vencimentoDiaMensal };
}

export function getPagamentoResumo(cota: Pick<Cota, "parcela1" | "parcela2" | "parcela3" | "parcela4" | "parcela5">) {
  const parcelas = [cota.parcela1, cota.parcela2, cota.parcela3, cota.parcela4, cota.parcela5].filter(
    (d): d is Date => d instanceof Date
  );
  const paidCount = parcelas.length;
  const lastPaid = parcelas.length > 0 ? new Date(Math.max(...parcelas.map((d) => d.getTime()))) : null;
  return { paidCount, lastPaid };
}

export function getExpectedPaidCountByToday(cota: Pick<Cota, "dataEntrada" | "administradora" | "assembleiaDia" | "vencimentoDiaMensal" | "antecedenciaPrimeiraParcelaDias" | "grupo">, today = new Date()) {
  const entry = new Date(cota.dataEntrada);
  const { assembleiaDia, antecedenciaPrimeiraParcelaDias, vencimentoDiaMensal } = getCotaRules(cota);

  let expected = 0;

  let y = entry.getFullYear();
  let m = entry.getMonth();
  let firstBase = safeDate(y, m, assembleiaDia);
  let firstDue = addDays(firstBase, -antecedenciaPrimeiraParcelaDias);
  while (entry.getTime() > firstDue.getTime()) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    firstBase = safeDate(y, m, assembleiaDia);
    firstDue = addDays(firstBase, -antecedenciaPrimeiraParcelaDias);
  }

  if (today.getTime() >= firstDue.getTime()) expected += 1;

  let year = y;
  let month = m + 1;
  while (expected < 5) {
    if (month > 11) {
      month = 0;
      year += 1;
    }
    const due = safeDate(year, month, vencimentoDiaMensal);
    if (today.getTime() >= due.getTime()) expected += 1;
    else break;
    month += 1;
  }

  return Math.min(expected, 5);
}

export function isCotaEmAtraso(
  cota: Pick<
    Cota,
    | "dataEntrada"
    | "administradora"
    | "assembleiaDia"
    | "vencimentoDiaMensal"
    | "antecedenciaPrimeiraParcelaDias"
    | "grupo"
    | "parcela1"
    | "parcela2"
    | "parcela3"
    | "parcela4"
    | "parcela5"
  >,
  today = new Date()
) {
  const { paidCount, lastPaid } = getPagamentoResumo(cota);
  const expected = getExpectedPaidCountByToday(cota, today);

  if (expected <= paidCount) return false;
  if (lastPaid && sameMonth(lastPaid, today)) return false;
  return true;
}

export function isClienteEmAtraso(cotas: Array<Parameters<typeof isCotaEmAtraso>[0]>, today = new Date()) {
  return cotas.some((c) => isCotaEmAtraso(c, today));
}

export function getCotaAtrasoDetalhes(
  cota: Parameters<typeof isCotaEmAtraso>[0],
  today = new Date()
): { cotasEmAtraso: 0 | 1; parcelasEmAtraso: number } {
  const { paidCount, lastPaid } = getPagamentoResumo(cota);
  const expected = getExpectedPaidCountByToday(cota, today);

  if (expected <= paidCount) return { cotasEmAtraso: 0, parcelasEmAtraso: 0 };
  if (lastPaid && sameMonth(lastPaid, today)) return { cotasEmAtraso: 0, parcelasEmAtraso: 0 };

  const diff = Math.max(0, expected - paidCount);
  return { cotasEmAtraso: 1, parcelasEmAtraso: diff };
}
