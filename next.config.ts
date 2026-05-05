import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Leaflet + Prisma */
  serverExternalPackages: ["leaflet", "@prisma/client"],

  /** 🔥 Ignorar erros de ESLint no build (Vercel) */
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
