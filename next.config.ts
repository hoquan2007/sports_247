import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
