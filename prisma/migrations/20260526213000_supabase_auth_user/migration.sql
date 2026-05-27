ALTER TABLE "User"
  ADD COLUMN "supabase_auth_id" TEXT;

ALTER TABLE "User"
  ALTER COLUMN "password" DROP NOT NULL;

CREATE UNIQUE INDEX "User_supabase_auth_id_key" ON "User"("supabase_auth_id");
