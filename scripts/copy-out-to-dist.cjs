/**
 * Capacitor `webDir` aponta para `dist`; o Next coloca o export estático em `out`.
 * Copia `out` → `dist` após `npm run build` (via script `postbuild`).
 *
 * Na Vercel não há `output: "export"` por omissão — não existe `out/` e a cópia
 * não faz sentido; evita qualquer excepção no fim do pipeline de build.
 */
const fs = require("fs");
const path = require("path");

if (process.env.VERCEL === "1") {
  console.log("postbuild: ignorado na Vercel (cópia out→dist só para builds Capacitor/local).");
  process.exit(0);
}

const outDir = path.join(__dirname, "..", "out");
const distDir = path.join(__dirname, "..", "dist");

if (!fs.existsSync(outDir)) {
  console.warn("postbuild: pasta out/ não existe — dist não foi criada.");
  process.exit(0);
}

try {
  fs.rmSync(distDir, { recursive: true, force: true });
  fs.cpSync(outDir, distDir, { recursive: true });
  console.log("postbuild: copiado out/ → dist/");
} catch (e) {
  console.warn("postbuild: falha ao copiar out/ → dist/ (build não vai falhar por isto).", e);
}
process.exit(0);
