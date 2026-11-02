import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  // Match data and filters live on the homepage. Don't index per-date API endpoints.
  return [{ url: SITE_URL, changeFrequency: "daily", priority: 1 }];
}
