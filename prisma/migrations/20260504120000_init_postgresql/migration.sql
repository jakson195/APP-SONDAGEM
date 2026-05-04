-- CreateSchema (PostgreSQL baseline; antes era SQLite local.)

CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Empresa" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Empresa_pkey" PRIMARY KEY ("id")
);

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

ALTER TABLE "Empresa" ADD CONSTRAINT "Empresa_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Obra" ADD CONSTRAINT "Obra_empresaId_fkey" FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Furo" ADD CONSTRAINT "Furo_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SPT" ADD CONSTRAINT "SPT_furoId_fkey" FOREIGN KEY ("furoId") REFERENCES "Furo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
