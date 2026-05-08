DO $$ BEGIN
  CREATE TYPE "ClienteCategoria" AS ENUM ('VIP', 'NORMAL', 'RISCO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "StatusPagamento" AS ENUM ('PAGO', 'PENDENTE', 'ATRASADO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "telefone" TEXT;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "pontuacaoRanking" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Cliente" ADD COLUMN IF NOT EXISTS "categoria" "ClienteCategoria" NOT NULL DEFAULT 'NORMAL';

CREATE INDEX IF NOT EXISTS "Cliente_telefone_idx" ON "Cliente"("telefone");

ALTER TABLE "Cota" ADD COLUMN IF NOT EXISTS "statusPagamento" "StatusPagamento" NOT NULL DEFAULT 'PENDENTE';

CREATE TABLE IF NOT EXISTS "BoletoEnvio" (
  "id" TEXT NOT NULL,
  "clienteId" TEXT,
  "cotaId" TEXT,
  "arquivo" TEXT NOT NULL,
  "grupo" TEXT,
  "cota" TEXT,
  "telefone" TEXT,
  "status" TEXT NOT NULL,
  "erro" TEXT,
  "tentativas" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "sentAt" TIMESTAMP(3),
  CONSTRAINT "BoletoEnvio_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BoletoEnvio_status_idx" ON "BoletoEnvio"("status");
CREATE INDEX IF NOT EXISTS "BoletoEnvio_createdAt_idx" ON "BoletoEnvio"("createdAt");
CREATE INDEX IF NOT EXISTS "BoletoEnvio_clienteId_idx" ON "BoletoEnvio"("clienteId");
CREATE INDEX IF NOT EXISTS "BoletoEnvio_cotaId_idx" ON "BoletoEnvio"("cotaId");

DO $$ BEGIN
  ALTER TABLE "BoletoEnvio"
    ADD CONSTRAINT "BoletoEnvio_clienteId_fkey"
    FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "BoletoEnvio"
    ADD CONSTRAINT "BoletoEnvio_cotaId_fkey"
    FOREIGN KEY ("cotaId") REFERENCES "Cota"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
