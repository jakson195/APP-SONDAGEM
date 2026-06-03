import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
  output: "standalone",
  /** Next 16 usa Turbopack por defeito; o projeto tem webpack custom (Cesium). */
  turbopack: {},
  serverExternalPackages: ["leaflet", "@prisma/client", "cesium", "pg"],
  async rewrites() {
    return [
      {
        source: "/api/geo/api/v1/:path*",
        destination: "/api/geo/v1/:path*",
      },
      {
        source: "/geofisica/temporal",
        destination: "/geo/temporal",
      },
      {
        source: "/geofisica/temporal/:path*",
        destination: "/geo/temporal/:path*",
      },
      {
        source: "/api/geofisica/temporal/:path*",
        destination: "/api/geo/temporal/:path*",
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