import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import cesium from "vite-plugin-cesium";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(rootDir, ".."), "");
  return {
    plugins: [react(), cesium()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/api": {
          target: env.VITE_API_URL || "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
    define: {
      CESIUM_BASE_URL: JSON.stringify("/cesium"),
    },
  };
});
