import https from "node:https";

type FetchTextResult = { ok: boolean; status: number; text: string };

function tlsMode(): "strict" | "insecure" | "auto" {
  const raw = (process.env.HIDROBR_TLS_VERIFY ?? "auto").trim().toLowerCase();
  if (raw === "false" || raw === "0" || raw === "insecure") return "insecure";
  if (raw === "true" || raw === "1") return "strict";
  return "auto";
}

function isTlsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /certificate|UNABLE_TO_VERIFY|fetch failed|self signed|altnames/i.test(msg);
}

function fetchInsecure(url: string, timeoutMs: number): Promise<FetchTextResult> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { rejectUnauthorized: false, headers: { Accept: "application/xml, text/xml, */*" } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status, text });
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error("timeout")));
  });
}

/** Fetch texto no servidor Next — contorna SSL ANA/INMET em dev Windows. */
export async function fetchUrlText(
  url: string,
  init?: { headers?: Record<string, string>; timeoutMs?: number },
): Promise<FetchTextResult> {
  const timeoutMs = init?.timeoutMs ?? 25_000;
  const mode = tlsMode();
  const insecureOk =
    mode === "insecure" ||
    (mode === "auto" && process.env.NODE_ENV !== "production");

  if (mode === "insecure" || (mode === "auto" && process.env.NODE_ENV !== "production")) {
    try {
      return await fetchInsecure(url, timeoutMs);
    } catch (e) {
      if (!insecureOk) throw e;
    }
  }

  try {
    const res = await fetch(url, {
      headers: init?.headers ?? { Accept: "application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } catch (e) {
    if (insecureOk && isTlsError(e)) {
      return fetchInsecure(url, timeoutMs);
    }
    throw e;
  }
}
