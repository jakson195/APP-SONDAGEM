ALTER TABLE "Empresa"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "primary_color" TEXT,
  ADD COLUMN "portal_enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "share_reports_enabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Empresa"
SET "slug" = CONCAT(
  TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(COALESCE("nome", 'cliente')), '[^a-z0-9]+', '-', 'g')),
  '-',
  "id"
)
WHERE "slug" IS NULL OR BTRIM("slug") = '';

ALTER TABLE "Empresa"
  ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "Empresa_slug_key" ON "Empresa"("slug");

CREATE TABLE "ClientReportShare" (
  "id" SERIAL NOT NULL,
  "empresaId" INTEGER NOT NULL,
  "furoId" INTEGER NOT NULL,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "published" BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientReportShare_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientReportShare_slug_key" ON "ClientReportShare"("slug");
CREATE UNIQUE INDEX "ClientReportShare_empresaId_furoId_key" ON "ClientReportShare"("empresaId", "furoId");
CREATE INDEX "ClientReportShare_empresaId_published_idx" ON "ClientReportShare"("empresaId", "published");

ALTER TABLE "ClientReportShare"
  ADD CONSTRAINT "ClientReportShare_empresaId_fkey"
  FOREIGN KEY ("empresaId") REFERENCES "Empresa"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientReportShare"
  ADD CONSTRAINT "ClientReportShare_furoId_fkey"
  FOREIGN KEY ("furoId") REFERENCES "Furo"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientReportShare"
  ADD CONSTRAINT "ClientReportShare_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
