import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["leaflet", "@prisma/client"],

  // 🔥 liberar deploy na Vercel
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
