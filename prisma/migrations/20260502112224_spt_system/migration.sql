-- CreateTable
CREATE TABLE "Obra" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nome" TEXT NOT NULL,
    "cliente" TEXT,
    "cidade" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Furo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "codigo" TEXT NOT NULL,
    "cota" REAL,
    "profundidade" REAL,
    "obraId" TEXT NOT NULL,
    CONSTRAINT "Furo_obraId_fkey" FOREIGN KEY ("obraId") REFERENCES "Obra" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SPT" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "profundidade" REAL NOT NULL,
    "tipo" TEXT,
    "revestimento" TEXT,
    "n1" INTEGER NOT NULL,
    "n2" INTEGER NOT NULL,
    "n3" INTEGER NOT NULL,
    "nspt" INTEGER NOT NULL,
    "furoId" TEXT NOT NULL,
    CONSTRAINT "SPT_furoId_fkey" FOREIGN KEY ("furoId") REFERENCES "Furo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Camada" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inicio" REAL NOT NULL,
    "fim" REAL NOT NULL,
    "profundidade" REAL,
    "compacidade" TEXT,
    "descricao" TEXT NOT NULL,
    "cor" TEXT,
    "observacoes" TEXT,
    "furoId" TEXT NOT NULL,
    CONSTRAINT "Camada_furoId_fkey" FOREIGN KEY ("furoId") REFERENCES "Furo" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Borehole" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT NOT NULL,
    "local" TEXT NOT NULL,
    "latitude" REAL,
    "longitude" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SPTLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "depth" REAL NOT NULL,
    "golpes1" INTEGER NOT NULL,
    "golpes2" INTEGER NOT NULL,
    "golpes3" INTEGER NOT NULL,
    "solo" TEXT NOT NULL,
    "boreholeId" INTEGER NOT NULL,
    CONSTRAINT "SPTLog_boreholeId_fkey" FOREIGN KEY ("boreholeId") REFERENCES "Borehole" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
