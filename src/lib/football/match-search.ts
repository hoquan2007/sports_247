import type { FootballMatch } from "./types";

function normalizeSearchText(value: string): string {
  return value.normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function matchesSearch(match: FootballMatch, query: string, leagueShortName = ""): boolean {
  const searchTerms = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (searchTerms.length === 0) return query.trim().length === 0;

  const searchable = normalizeSearchText([
    match.home.name, match.home.shortName,
    match.away.name, match.away.shortName,
    match.leagueName, leagueShortName,
  ].join(" "));

  return searchTerms.every((term) => searchable.includes(term));
}
