import { prisma } from "@/lib/prisma";
import type { SavedGeophysSection } from "@/lib/geofisica/geophys-project/geophys-project-storage";
import type { SurveyLineGeometry } from "@/lib/geofisica/volume3d/volume3d-types";

const DEFAULT_SECTION_GEOMETRY: SurveyLineGeometry = {
  coordMode: "wgs84",
  start: { x: 0, y: 0, z: 0 },
  end: { x: 0, y: 0, z: 0 },
};

export function rowToSavedSection(row: {
  id: string;
  code: string;
  name: string;
  payload: unknown;
  savedAt: Date;
}): SavedGeophysSection {
  const payload = row.payload as Partial<SavedGeophysSection>;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    savedAt: row.savedAt.toISOString(),
    readings: payload.readings ?? [],
    topography: payload.topography,
    geometry:
      (payload.geometry as SurveyLineGeometry | undefined) ??
      DEFAULT_SECTION_GEOMETRY,
    invertParams: payload.invertParams,
    invertMethod: payload.invertMethod,
    invertSummary: payload.invertSummary,
    invertResult: payload.invertResult,
    linha: payload.linha,
    defaultAM: payload.defaultAM,
    surveyLocation: payload.surveyLocation,
  };
}

export async function listGeophysSectionsForObra(obraId: number) {
  const rows = await prisma.geophysSection.findMany({
    where: { obraId },
    orderBy: { code: "asc" },
  });
  return rows.map(rowToSavedSection);
}

export async function upsertGeophysSection(
  obraId: number,
  section: SavedGeophysSection,
  userId?: number,
) {
  const payload = {
    readings: section.readings,
    topography: section.topography,
    geometry: section.geometry,
    invertParams: section.invertParams,
    invertMethod: section.invertMethod,
    invertSummary: section.invertSummary,
    invertResult: section.invertResult,
    linha: section.linha,
    defaultAM: section.defaultAM,
    surveyLocation: section.surveyLocation,
  };

  const row = await prisma.geophysSection.upsert({
    where: {
      obraId_code: { obraId, code: section.code },
    },
    create: {
      obraId,
      code: section.code,
      name: section.name,
      payload,
      savedAt: new Date(section.savedAt),
      createdByUserId: userId ?? null,
    },
    update: {
      name: section.name,
      payload,
      savedAt: new Date(section.savedAt),
    },
  });

  return rowToSavedSection(row);
}

export async function deleteGeophysSectionById(obraId: number, sectionId: string) {
  const row = await prisma.geophysSection.findFirst({
    where: { obraId, id: sectionId },
  });
  if (!row) return false;
  await prisma.geophysSection.delete({ where: { id: row.id } });
  return true;
}

export async function syncGeophysProjectToDb(
  obraId: number,
  sections: SavedGeophysSection[],
  userId?: number,
) {
  const results: SavedGeophysSection[] = [];
  for (const s of sections) {
    results.push(await upsertGeophysSection(obraId, s, userId));
  }
  return results;
}
