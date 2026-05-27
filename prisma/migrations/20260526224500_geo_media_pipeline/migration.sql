CREATE TABLE "geo_photos" (
  "id" SERIAL NOT NULL,
  "company_id" INTEGER NOT NULL,
  "obra_id" INTEGER,
  "uploaded_by_user_id" INTEGER,
  "latitude" DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "altitude" DOUBLE PRECISION,
  "image_url" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "original_name" TEXT,
  "captured_at" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "geo_photos_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "street_frames" (
  "id" TEXT NOT NULL,
  "company_id" INTEGER NOT NULL,
  "obra_id" INTEGER,
  "uploaded_by_user_id" INTEGER,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "heading" DOUBLE PRECISION,
  "image_url" TEXT NOT NULL,
  "storage_path" TEXT NOT NULL,
  "video_id" TEXT NOT NULL,
  "frame_index" INTEGER NOT NULL DEFAULT 0,
  "timestamp" TIMESTAMP(3),
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "street_frames_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "geo_photos_company_id_created_at_idx"
  ON "geo_photos"("company_id", "created_at");
CREATE INDEX "geo_photos_obra_id_captured_at_idx"
  ON "geo_photos"("obra_id", "captured_at");

CREATE INDEX "street_frames_company_id_timestamp_idx"
  ON "street_frames"("company_id", "timestamp");
CREATE INDEX "street_frames_obra_id_video_id_idx"
  ON "street_frames"("obra_id", "video_id");
CREATE INDEX "street_frames_video_id_frame_index_idx"
  ON "street_frames"("video_id", "frame_index");

ALTER TABLE "geo_photos"
  ADD CONSTRAINT "geo_photos_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "Empresa"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "geo_photos"
  ADD CONSTRAINT "geo_photos_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "Obra"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "geo_photos"
  ADD CONSTRAINT "geo_photos_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "street_frames"
  ADD CONSTRAINT "street_frames_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "Empresa"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "street_frames"
  ADD CONSTRAINT "street_frames_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "Obra"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "street_frames"
  ADD CONSTRAINT "street_frames_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
