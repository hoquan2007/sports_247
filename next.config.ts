import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "a.espncdn.com" },
      { protocol: "https", hostname: "api.openligadb.de" },
      { protocol: "https", hostname: "www.openligadb.de" },
    ],
  },
};

export default nextConfig;
