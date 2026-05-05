import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["leaflet", "@prisma/client"],
};

export default nextConfig;