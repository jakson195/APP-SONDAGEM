import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["leaflet", "@prisma/client", "cesium", "pg"],
  async rewrites() {
    return [
      {
        source: "/api/geo/api/v1/:path*",
        destination: "/api/geo/v1/:path*",
      },
    ];
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      cesium: path.resolve(__dirname, "node_modules/cesium"),
    };
    return config;
  },
};

export default nextConfig;