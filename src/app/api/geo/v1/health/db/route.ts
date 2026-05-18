import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** PostGIS via GEO_DATABASE_URL (opcional). */
export async function GET() {
  const url = process.env.GEO_DATABASE_URL;
  if (!url) {
    return NextResponse.json({
      status: "degraded",
      postgis: "GEO_DATABASE_URL não configurada",
    });
  }
  try {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url.replace("postgresql+asyncpg://", "postgresql://") });
    const r = await pool.query("SELECT PostGIS_Version() AS v");
    await pool.end();
    return NextResponse.json({ status: "ok", postgis: r.rows[0]?.v ?? "unknown" });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { status: "error", postgis: String(e instanceof Error ? e.message : e) },
      { status: 503 },
    );
  }
}
