-- Módulos por obra (ProjectModule)
CREATE TABLE "ProjectModule" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProjectModule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectModule_projectId_module_key" ON "ProjectModule"("projectId", "module");

ALTER TABLE "ProjectModule" ADD CONSTRAINT "ProjectModule_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Obra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "ProjectModule" ("projectId", "module", "active")
SELECT o."id", v.module, true
FROM "Obra" o
CROSS JOIN (
  VALUES
    ('spt'),
    ('rotativa'),
    ('trado'),
    ('piezo'),
    ('resistividade'),
    ('geo'),
    ('relatorios')
) AS v(module)
ON CONFLICT ("projectId", "module") DO NOTHING;
