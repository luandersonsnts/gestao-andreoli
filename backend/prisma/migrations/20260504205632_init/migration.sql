-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "fotoPath" TEXT,
    "tirouFoto" BOOLEAN NOT NULL DEFAULT false,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cota" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "grupo" TEXT NOT NULL,
    "cota" TEXT NOT NULL,
    "dataEntrada" TIMESTAMP(3) NOT NULL,
    "administradora" TEXT NOT NULL,
    "contemplado" BOOLEAN NOT NULL DEFAULT false,
    "parcelaContemplacao" INTEGER,
    "dataContemplacao" TIMESTAMP(3),
    "parcela1" TIMESTAMP(3),
    "parcela2" TIMESTAMP(3),
    "parcela3" TIMESTAMP(3),
    "parcela4" TIMESTAMP(3),
    "parcela5" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cota_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Cliente_nome_idx" ON "Cliente"("nome");

-- CreateIndex
CREATE INDEX "Cota_clienteId_idx" ON "Cota"("clienteId");

-- CreateIndex
CREATE INDEX "Cota_administradora_idx" ON "Cota"("administradora");

-- CreateIndex
CREATE INDEX "Cota_dataEntrada_idx" ON "Cota"("dataEntrada");

-- CreateIndex
CREATE UNIQUE INDEX "Cota_clienteId_grupo_cota_administradora_key" ON "Cota"("clienteId", "grupo", "cota", "administradora");

-- AddForeignKey
ALTER TABLE "Cota" ADD CONSTRAINT "Cota_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;
