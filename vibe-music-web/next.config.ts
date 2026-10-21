import type { NextConfig } from "next";

const apiUrl = (process.env.API_INTERNAL_URL ?? "http://127.0.0.1:18000").replace(/\/$/, "");

const config: NextConfig = {
  experimental: { proxyTimeout: 330_000 },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${apiUrl}/:path*` },
      { source: "/media/:path*", destination: `${apiUrl}/media/:path*` },
    ];
  },
};

export default config;
