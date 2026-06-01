import { NextResponse } from "next/server";
import { fetchDemElevations } from "@/lib/geofisica/geodata/fetch-elevation-dem";
import { localMToLatLng } from "@/lib/hydraulic-interpolation";

const MAX_GRID_POINTS = 3600;
const CHUNK_SIZE = 90;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      anchorLat?: number;
      anchorLng?: number;
      boundsM?: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      };
      nx?: number;
      ny?: number;
    };

    const anchorLat = body.anchorLat;
    const anchorLng = body.anchorLng;
    const boundsM = body.boundsM;
    const nx = body.nx;
    const ny = body.ny;

    if (
      anchorLat == null ||
      anchorLng == null ||
      !Number.isFinite(anchorLat) ||
      !Number.isFinite(anchorLng) ||
      !boundsM ||
      nx == null ||
      ny == null ||
      nx < 2 ||
      ny < 2 ||
      nx > 80 ||
      ny > 80
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "Parâmetros inválidos (anchorLat/Lng, boundsM, nx, ny).",
        },
        { status: 400 },
      );
    }

    const total = nx * ny;
    if (total > MAX_GRID_POINTS) {
      return NextResponse.json(
        {
          ok: false,
          error: `Grelha demasiado grande (${total} pts). Reduza NX×NY (máx. ${MAX_GRID_POINTS}).`,
        },
        { status: 400 },
      );
    }

    const dx = (boundsM.maxX - boundsM.minX) / nx;
    const dy = (boundsM.maxY - boundsM.minY) / ny;

    const locations: { lat: number; lng: number; idx: number }[] = [];
    for (let j = 0; j < ny; j++) {
      const py = boundsM.minY + (j + 0.5) * dy;
      for (let i = 0; i < nx; i++) {
        const px = boundsM.minX + (i + 0.5) * dx;
        const ll = localMToLatLng(anchorLat, anchorLng, { x: px, y: py });
        locations.push({ lat: ll.lat, lng: ll.lng, idx: i + j * nx });
      }
    }

    const surfaceM = new Array<number>(total).fill(NaN);
    let source = "none";
    let dataset = "none";
    let validTotal = 0;

    for (let offset = 0; offset < locations.length; offset += CHUNK_SIZE) {
      const chunk = locations.slice(offset, offset + CHUNK_SIZE);
      const result = await fetchDemElevations(
        chunk.map(({ lat, lng }) => ({ lat, lng })),
      );
      source = result.source;
      dataset = result.dataset;

      for (let k = 0; k < chunk.length; k++) {
        const elev = result.points[k]?.elevationM;
        if (elev != null && Number.isFinite(elev)) {
          surfaceM[chunk[k]!.idx] = elev;
          validTotal++;
        }
      }
    }

    if (validTotal < Math.max(4, total * 0.25)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "DEM não devolveu cotas suficientes para a área do volume. Verifique se as linhas estão posicionadas no mapa.",
          validCount: validTotal,
        },
        { status: 502 },
      );
    }

    const fallback =
      surfaceM.filter(Number.isFinite).reduce((a, b) => a + b, 0) / validTotal;
    for (let i = 0; i < total; i++) {
      if (!Number.isFinite(surfaceM[i]!)) surfaceM[i] = fallback;
    }

    const surfaceRefM =
      surfaceM.reduce((a, b) => a + b, 0) / Math.max(1, surfaceM.length);

    return NextResponse.json({
      ok: true,
      surfaceM,
      surfaceRefM,
      source,
      dataset,
      validCount: validTotal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro ao consultar DEM";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
