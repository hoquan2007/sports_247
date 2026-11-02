/** Ask ESPN's image combiner for a display-sized crest instead of a 500px original. */
export function teamLogoImageUrl(logo: string, size: number): string {
  try {
    const url = new URL(logo);
    if (url.origin !== "https://a.espncdn.com" || url.search ||
      !/^\/i\/teamlogos\/soccer\/500\/[a-zA-Z0-9_-]+\.png$/.test(url.pathname) ||
      !Number.isFinite(size) || size <= 0) return logo;

    // 2x density keeps the small row crests crisp without downloading 500px PNGs.
    const pixels = Math.min(208, Math.max(64, Math.ceil(size * 2 / 8) * 8));
    return `${url.origin}/combiner/i?img=${url.pathname}&w=${pixels}&h=${pixels}&cquality=75&location=origin`;
  } catch {
    return logo;
  }
}
