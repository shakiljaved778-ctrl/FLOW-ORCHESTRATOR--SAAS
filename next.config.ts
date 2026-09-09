import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // App Router server actions body size for CSV exports / audit reports
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  // PSP webhooks arrive as raw bodies; ensure they are not mangled.
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "X-Content-Type-Options", value: "nosniff" }],
      },
    ];
  },
};

export default nextConfig;
