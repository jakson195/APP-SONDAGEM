import type { Connect } from "vite";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const BASE = "/hidrogeo-viewer/";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Redirecciona `/` → `/hidrogeo-viewer/` (URL documentada). */
function redirectRootToViewer() {
  return {
    name: "redirect-root-to-viewer",
    configureServer(server: { middlewares: Connect.Server }) {
      server.middlewares.use((req, res, next) => {
        const pathOnly = (req.url ?? "").split("?")[0];
        if (pathOnly === "/" || pathOnly === "") {
          res.writeHead(302, { Location: BASE });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

/** Viewer ANM Leilão — rota própria, independente do HidroGeo. */
function anmLeilaoViewerSpa() {
  return {
    name: "anm-leilao-viewer-spa",
    configureServer(server: {
      middlewares: Connect.Server;
      transformIndexHtml: (url: string, html: string) => Promise<string>;
    }) {
      server.middlewares.use(async (req, res, next) => {
        const raw = req.url ?? "";
        const pathOnly = raw.split("?")[0];
        if (pathOnly === "/anm-leilao-viewer" || pathOnly === "/anm-leilao-viewer/") {
          try {
            const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf-8");
            const transformed = await server.transformIndexHtml(raw, html);
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end(transformed);
          } catch (err) {
            next(err);
          }
          return;
        }
        next();
      });
    },
  };
}

/** Base `/hidrogeo-viewer/` — abrir http://localhost:5175/hidrogeo-viewer/ */
export default defineConfig({
  base: BASE,
  plugins: [react(), tailwindcss(), redirectRootToViewer(), anmLeilaoViewerSpa()],
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    open: BASE,
    cors: true,
    headers: {
      "Content-Security-Policy":
        "frame-ancestors 'self' http://localhost:3000 http://127.0.0.1:3000 http://localhost:3002 http://127.0.0.1:3002",
    },
    proxy: {
      "/api": { target: "http://localhost:8010", changeOrigin: true },
      "/tiles": {
        target: "http://localhost:7800",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/tiles/, ""),
      },
    },
  },
});
