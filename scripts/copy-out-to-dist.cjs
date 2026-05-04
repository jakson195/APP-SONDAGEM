/**
 * Capacitor `webDir` aponta para `dist`; o Next coloca o export estático em `out`.
 * Copia `out` → `dist` após `npm run build` (via script `postbuild`).
 */
const fs = require("fs");
const path = require("path");

const outDir = path.join(__dirname, "..", "out");
const distDir = path.join(__dirname, "..", "dist");

if (!fs.existsSync(outDir)) {
  console.warn("postbuild: pasta out/ não existe — dist não foi criada.");
  process.exit(0);
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.cpSync(outDir, distDir, { recursive: true });
console.log("postbuild: copiado out/ → dist/");
