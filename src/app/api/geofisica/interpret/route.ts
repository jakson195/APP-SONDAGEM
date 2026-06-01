import { NextResponse } from "next/server";
import {
  enhanceRegionalWithOpenAI,
  enhanceSectionWithOpenAI,
  isGeophysAiAvailable,
  type SectionAiInput,
} from "@/lib/geofisica/ai/geophys-interpret-ai";
import { buildRegionalGeology } from "@/lib/geofisica/dipolo2d/build-regional-geology";
import { GARUVA_DEFAULT_LOCATION } from "@/lib/geofisica/dipolo2d/regional-geology";
import type {
  InvertCellSummary,
  RegionalGeologyProfile,
} from "@/lib/geofisica/dipolo2d/interpret-types";

type Body = {
  mode?: "regional" | "section";
  lat?: number;
  lng?: number;
  cellSummary?: InvertCellSummary | null;
  regional?: RegionalGeologyProfile;
  section?: Omit<SectionAiInput, "lat" | "lng" | "regional" | "cellSummary">;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const lat =
      typeof body.lat === "number" && Number.isFinite(body.lat)
        ? body.lat
        : GARUVA_DEFAULT_LOCATION.lat;
    const lng =
      typeof body.lng === "number" && Number.isFinite(body.lng)
        ? body.lng
        : GARUVA_DEFAULT_LOCATION.lng;

    if (body.mode === "section" && body.section && body.regional) {
      const sectionAi = await enhanceSectionWithOpenAI({
        lat,
        lng,
        regional: body.regional,
        cellSummary: body.cellSummary ?? null,
        ...body.section,
      });
      return NextResponse.json({
        ok: true,
        lat,
        lng,
        sectionAi,
        aiAvailable: isGeophysAiAvailable(),
      });
    }

    const baseProfile = await buildRegionalGeology(lat, lng);
    const regional = await enhanceRegionalWithOpenAI(
      baseProfile,
      lat,
      lng,
      body.cellSummary ?? null,
    );

    return NextResponse.json({
      ok: true,
      lat,
      lng,
      regional: { ...regional, anchorLat: lat, anchorLng: lng },
      aiAvailable: isGeophysAiAvailable(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro na interpretação geofísica";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
