import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const CATALOG_PATH = path.join(
  process.cwd(),
  "public",
  "data",
  "hidrochu",
  "hidrochu-municipios-sc.json",
);

export async function GET(req: Request) {
  const raw = await readFile(CATALOG_PATH, "utf8");
  const catalog = JSON.parse(raw) as {
    municipios: { nome: string }[];
  };
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim().toLowerCase();
  if (q) {
    const municipios = catalog.municipios.filter((m) =>
      m.nome.toLowerCase().includes(q),
    );
    return NextResponse.json({ ...catalog, municipios, totalMunicipios: municipios.length });
  }
  return NextResponse.json(JSON.parse(raw));
}
