import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep Windows static-page workers serial. Parallel prerender occasionally
    // fails with EPERM while creating nested .next/server/app segment folders.
    cpus: 1,
  },
  images: {
    // ESPN crests use their image combiner; enable Next's resizing only for VPF badges.
    remotePatterns: [
      { protocol: "https", hostname: "a.espncdn.com" },
      { protocol: "https", hostname: "api.openligadb.de" },
      { protocol: "https", hostname: "www.openligadb.de" },
      { protocol: "https", hostname: "media.api-sports.io", pathname: "/football/teams/*.png" },
      { protocol: "https", hostname: "vpf.vn", pathname: "/wp-content/uploads/2026/09/*" },
    ],
  },
};

export default nextConfig;
