import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",

  // mantém isso que você já tem
  serverExternalPackages: ["leaflet"],
};

export default nextConfig;
