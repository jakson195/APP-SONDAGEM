-- Obra: estado + descrição (companyId já existe como coluna empresaId)
DO $$ BEGIN
    CREATE TYPE "ObraStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Obra" ADD COLUMN IF NOT EXISTS "status" "ObraStatus" NOT NULL DEFAULT 'ACTIVE';
