import { NextResponse } from "next/server";

const PYTHON_URL =
  process.env.GEOPHYSICS_ENGINE_URL ?? "http://127.0.0.1:8092";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(
      `${PYTHON_URL}/api/v1/geophysics/qc/analyze-line`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      },
    );

    if (!res.ok) {
      const detail = await res.text();
      return NextResponse.json(
        {
          ok: false,
          error: `Motor Python QC (${res.status}): ${detail.slice(0, 200)}`,
        },
        { status: 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro QC Python";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
