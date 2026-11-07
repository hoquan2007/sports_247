/** Ask ESPN's image combiner for a display-sized crest instead of a 500px original. */
function espnLogoImageUrl(logo: string, size: number, type: "teamlogos" | "leaguelogos", pixelRatio = 2): string {
  try {
    const url = new URL(logo);
    if (url.origin !== "https://a.espncdn.com" || url.search ||
      !new RegExp(`^/i/${type}/soccer/500/[a-zA-Z0-9_-]+\\.png$`).test(url.pathname) ||
      !Number.isFinite(size) || size <= 0 || !Number.isFinite(pixelRatio) || pixelRatio <= 0) return logo;

    // Default to 2x for rows. Responsive Image loaders pass the physical width directly.
    const pixels = Math.min(208, Math.max(64, Math.ceil(size * pixelRatio / 8) * 8));
    return `${url.origin}/combiner/i?img=${url.pathname}&w=${pixels}&h=${pixels}&cquality=75&location=origin`;
  } catch {
    return logo;
  }
}

export const teamLogoImageUrl = (logo: string, size: number, pixelRatio = 2) => espnLogoImageUrl(logo, size, "teamlogos", pixelRatio);
export const leagueLogoImageUrl = (logo: string, size: number) => espnLogoImageUrl(logo, size, "leaguelogos");
