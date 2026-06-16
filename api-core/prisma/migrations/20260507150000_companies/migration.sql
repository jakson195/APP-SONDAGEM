-- Alinha DB existente ao schema (idempotente onde possível)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'SystemRole' AND e.enumlabel = 'SUPER_ADMIN'
  ) THEN
    ALTER TYPE "SystemRole" ADD VALUE 'SUPER_ADMIN';
  END IF;
END $$;

ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "cnpj" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "logo" TEXT;
ALTER TABLE "Empresa" ADD COLUMN IF NOT EXISTS "phone" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Empresa_cnpj_key" ON "Empresa"("cnpj");
