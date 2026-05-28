export type User = {
  id: string;
  email: string;
  nome: string | null;
  role: "ADMIN" | "COMERCIAL" | "LEITURA";
};

export type UserListItem = User & {
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CotaInput = {
  grupo: string;
  cota: string;
  dataEntrada: string;
  status?: "ativo" | "inativo";
  administradora: string;
  assembleiaDia: number | null;
  vencimentoDiaMensal: number | null;
  antecedenciaPrimeiraParcelaDias: number | null;
  contemplado: boolean;
  parcelaContemplacao: number | null;
  dataContemplacao: string | null;
  parcela1: string | null;
  parcela2: string | null;
  parcela3: string | null;
  parcela4: string | null;
  parcela5: string | null;
};

export type Cliente = {
  id: string;
  nome: string;
  telefone: string | null;
  active: boolean;
  statusCliente: "ativo" | "desistente" | "excluido";
  motivoDesistencia: string | null;
  dataDesistencia: string | null;
  pontuacaoRanking: number;
  categoria: "VIP" | "NORMAL" | "RISCO";
  dataNascimento: string | null;
  fotoPath: string | null;
  tirouFoto: boolean;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
  cotas: Array<
    {
      id: string;
      clienteId: string;
      grupo: string;
      cota: string;
      dataEntrada: string;
      status: "ativo" | "inativo";
      administradora: string;
      assembleiaDia: number | null;
      vencimentoDiaMensal: number | null;
      antecedenciaPrimeiraParcelaDias: number | null;
      contemplado: boolean;
      parcelaContemplacao: number | null;
      dataContemplacao: string | null;
      parcela1: string | null;
      parcela2: string | null;
      parcela3: string | null;
      parcela4: string | null;
      parcela5: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >;
};

export type ClienteListItem = {
  id: string;
  nome: string;
  telefone: string | null;
  active: boolean;
  statusCliente: "ativo" | "desistente" | "excluido";
  motivoDesistencia: string | null;
  dataDesistencia: string | null;
  pontuacaoRanking: number;
  categoria: "VIP" | "NORMAL" | "RISCO";
  dataNascimento: string | null;
  fotoPath: string | null;
  tirouFoto: boolean;
  observacoes: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { cotas: number };
  isVip: boolean;
  contempladasCount: number;
  possuiContemplacao: boolean;
  possuiParcelasEmAberto: boolean;
};

export type DashboardSummary = {
  totals: {
    totalClientes: number;
    totalContemplados: number;
    totalNaoContemplados: number;
    totalDesistentes: number;
    totalExcluidos: number;
    totalVip: number;
    tirouFoto: number;
    naoTirouFoto: number;
    taxaConversao: number;
  };
  charts: {
    contempladosVsNao: { labels: string[]; values: number[] };
    entradasMensais: { labels: string[]; values: number[] };
    administradoras: { labels: string[]; values: number[] };
    clientesPorCotas: { labels: string[]; values: number[] };
  };
};

export type NotificationsResponse = {
  alerts: Array<{
    key: string;
    title: string;
    count: number;
    clientes: Array<{ id: string; nome: string; cotasEmAtraso?: number; parcelasEmAtraso?: number }>;
  }>;
};

export type AutomationDashboard = {
  enviadosHoje: number;
  pendentes: number;
  erros: number;
  clientesComAtraso: number;
  taxaSucessoHoje: number;
  workerAtivo: boolean;
  workerErro?: string | null;
};

export type AutomationJob = {
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
};
