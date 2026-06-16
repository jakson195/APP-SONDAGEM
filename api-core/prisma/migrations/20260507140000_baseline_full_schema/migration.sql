-- CreateEnum
CREATE TYPE "SystemRole" AS ENUM ('MASTER_ADMIN', 'SUPER_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "OrgRole" AS ENUM ('ADMIN', 'MANAGER', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'TRIAL', 'SUSPENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "systemRole" "SystemRole" NOT NULL DEFAULT 'USER',

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "planSlug" TEXT,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "cnpj" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipe" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "empresaId" INTEGER NOT NULL,

    CONSTRAINT "Equipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrgMembership" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "equipeId" INTEGER,
    "orgRole" "OrgRole" NOT NULL DEFAULT 'MEMBER',
    "modulosPermitidos" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "OrgMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmpresaModulo" (
    "id" SERIAL NOT NULL,
    "empresaId" INTEGER NOT NULL,
    "modulo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EmpresaModulo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obra" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cliente" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "empresaId" INTEGER NOT NULL,

    CONSTRAINT "Obra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Furo" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "tipoCampo" TEXT NOT NULL DEFAULT 'spt',
    "obraId" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "dadosCampo" JSONB,

    CONSTRAINT "Furo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SPT" (
    "id" SERIAL NOT NULL,
    "prof" DOUBLE PRECISION NOT NULL,
    "g1" INTEGER NOT NULL,
    "g2" INTEGER NOT NULL,
    "g3" INTEGER NOT NULL,
    "cm1" INTEGER NOT NULL DEFAULT 15,
    "cm2" INTEGER NOT NULL DEFAULT 15,
    "cm3" INTEGER NOT NULL DEFAULT 15,
    "solo" TEXT NOT NULL,
    "furoId" INTEGER NOT NULL,

    CONSTRAINT "SPT_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VESProject" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "metodo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VESProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Empresa_cnpj_key" ON "Empresa"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "OrgMembership_userId_empresaId_key" ON "OrgMembership"("userId", "empresaId");

-- CreateIndex
CREATE UNIQUE INDEX "EmpresaModulo_empresaId_modulo_key" ON "EmpresaModulo"("empresaId", "modulo");

-- CreateIndex
CREATE UNIQUE INDEX "VESProject_nome_key" ON "VESProject"("nome");

-- AddForeignKey
ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipe" ADD CONSTRAINT "Equipe_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembership" ADD CONSTRAINT "OrgMembership_equipeId_fkey" FOREIGN KEY ("equipeId") REFERENCES "Equipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmpresaModulo" ADD CONSTRAINT "EmpresaModulo_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Obra" ADD CONSTRAINT "Obra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Furo" ADD CONSTRAINT "Furo_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SPT" ADD CONSTRAINT "SPT_furoId_fkey" FOREIGN KEY ("furoId") REFERENCES "Furo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
