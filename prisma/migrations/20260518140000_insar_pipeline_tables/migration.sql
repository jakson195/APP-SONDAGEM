-- InSAR pipeline jobs, GeoTIFF rasters, Sentinel-1 catalog (Prisma models sem migração anterior).

CREATE TYPE "InsarPipelineJobStatus" AS ENUM (
  'pending',
  'resolving_scenes',
  'downloading_slc',
  'snap_processing',
  'exporting_geotiff',
  'completed',
  'failed'
);

CREATE TABLE "InsarPipelineJob" (
  "id" SERIAL NOT NULL,
  "obra_id" INTEGER NOT NULL,
  "name" TEXT NOT NULL DEFAULT 'InSAR',
  "status" "InsarPipelineJobStatus" NOT NULL DEFAULT 'pending',
  "date_from" TIMESTAMP(3) NOT NULL,
  "date_to" TIMESTAMP(3) NOT NULL,
  "reference_date" TIMESTAMP(3),
  "orbit_direction" TEXT,
  "aoi_wkt" TEXT,
  "master_copernicus_id" TEXT,
  "slave_copernicus_id" TEXT,
  "scene_count" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "properties" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InsarPipelineJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InsarPipelineJob_obra_id_created_at_idx" ON "InsarPipelineJob"("obra_id", "created_at");

ALTER TABLE "InsarPipelineJob"
  ADD CONSTRAINT "InsarPipelineJob_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InsarGeoRaster" (
  "id" SERIAL NOT NULL,
  "job_id" INTEGER NOT NULL,
  "raster_kind" TEXT NOT NULL,
  "epoch_date" TIMESTAMP(3),
  "relative_path" TEXT NOT NULL,
  "file_size_bytes" BIGINT,
  "crs_epsg" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "min_value" DOUBLE PRECISION,
  "max_value" DOUBLE PRECISION,
  "mean_value" DOUBLE PRECISION,
  "nodata_value" DOUBLE PRECISION,
  "units" TEXT NOT NULL DEFAULT 'mm',
  "footprint_geo_json" JSONB,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InsarGeoRaster_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InsarGeoRaster_job_id_raster_kind_idx" ON "InsarGeoRaster"("job_id", "raster_kind");

ALTER TABLE "InsarGeoRaster"
  ADD CONSTRAINT "InsarGeoRaster_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "InsarPipelineJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Sentinel1CatalogEntry" (
  "id" SERIAL NOT NULL,
  "copernicus_id" TEXT NOT NULL,
  "product_name" TEXT NOT NULL,
  "product_type" TEXT NOT NULL DEFAULT 'SLC',
  "acquisition_at" TIMESTAMP(3) NOT NULL,
  "orbit_direction" TEXT,
  "polarization" TEXT,
  "footprint_wkt" TEXT,
  "s3_path" TEXT,
  "content_length" BIGINT,
  "download_url" TEXT,
  "local_path" TEXT,
  "archive_sha256" TEXT,
  "download_status" TEXT DEFAULT 'pending',
  "integrity_ok" BOOLEAN,
  "obra_id" INTEGER,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Sentinel1CatalogEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Sentinel1CatalogEntry_copernicus_id_key" ON "Sentinel1CatalogEntry"("copernicus_id");

CREATE INDEX "Sentinel1CatalogEntry_obra_id_acquisition_at_idx" ON "Sentinel1CatalogEntry"("obra_id", "acquisition_at");

ALTER TABLE "Sentinel1CatalogEntry"
  ADD CONSTRAINT "Sentinel1CatalogEntry_obra_id_fkey"
  FOREIGN KEY ("obra_id") REFERENCES "Obra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
