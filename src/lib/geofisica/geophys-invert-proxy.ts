import { NextResponse } from "next/server";

const PYTHON_URL =
  process.env.GEOPHYSICS_ENGINE_URL ?? "http://127.0.0.1:8092";

export const INVERT_TIMEOUT_MS = 1_200_000;
export const INVERT_MAX_DURATION = 1200;

export async function geophysInvertHealthResponse() {
  try {
    const res = await fetch(`${PYTHON_URL}/api/v1/geophysics/health`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, online: false, error: `Health ${res.status}` },
        { status: 503 },
      );
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json({ ok: true, online: true, ...data });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Motor indisponível";
    const msg = /fetch failed|ECONNREFUSED|ENOTFOUND|connect/i.test(raw)
      ? `Motor Python indisponível em ${PYTHON_URL}. Execute: npm run geophysics:engine`
      : raw;
    return NextResponse.json({ ok: false, online: false, error: msg }, { status: 503 });
  }
}

export async function geophysInvertPostResponse(req: Request) {
  try {
    const body = await req.json();
    const res = await fetch(`${PYTHON_URL}/api/v1/geophysics/invert/2d`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(INVERT_TIMEOUT_MS),
    });

    if (!res.ok) {
      const detail = await res.text();
      let message = detail.slice(0, 600);
      try {
        const parsed = JSON.parse(detail) as {
          detail?: string | Array<{ msg?: string; loc?: unknown[] }>;
        };
        if (Array.isArray(parsed.detail)) {
          message = parsed.detail
            .map((d) => d.msg ?? JSON.stringify(d))
            .join("; ");
        } else if (typeof parsed.detail === "string") {
          message = parsed.detail;
        }
      } catch {
        /* texto bruto */
      }
      return NextResponse.json(
        {
          ok: false,
          error: message,
          engineStatus: res.status,
        },
        { status: res.status === 422 ? 422 : 502 },
      );
    }

    const data = await res.json();
    return NextResponse.json({ ok: true, ...data });
  } catch (e) {
    const raw = e instanceof Error ? e.message : "Erro na inversão física";
    let msg = raw;
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|connect/i.test(raw)) {
      msg = `Motor Python indisponível em ${PYTHON_URL}. Execute: npm run geophysics:engine (porta 8092).`;
    } else if (/timeout|aborted/i.test(raw)) {
      msg =
        "Inversão excedeu o tempo limite (~20 min). Prefira FDM (adjoint) em vez de FEM, ou reduza Células X/Z.";
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}
