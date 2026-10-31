import { LEAGUES, shiftDate, vietnamDate } from "./leagues";
import { settleLimited } from "./settle-limited";
import { parseRecentForm } from "./recent-form";
import type { FootballMatch, FootballTeam, MatchFeed, MatchStatus } from "./types";

interface EspnCompetitor {
  id?: string;
  form?: string;
  homeAway?: string;
  score?: string;
  team?: { id?: string; displayName?: string; shortDisplayName?: string; logo?: string };
}
interface EspnEvent {
  id?: string;
  date?: string;
  status?: { displayClock?: string; type?: { state?: string; shortDetail?: string } };
  competitions?: Array<{
    competitors?: EspnCompetitor[];
    venue?: { fullName?: string };
    broadcasts?: Array<{ names?: string[] }>;
  }>;
}

function teamFromEspn(comp: EspnCompetitor): FootballTeam {
  const team = comp.team ?? {};
  const form = parseRecentForm(comp.form);
  return {
    id: team.id ?? comp.id ?? "unknown",
    name: team.displayName ?? "Chưa xác định",
    shortName: team.shortDisplayName ?? team.displayName ?? "TBD",
    logo: team.logo?.startsWith("https://a.espncdn.com/") ? team.logo : null,
    ...(form.length ? { form } : {}),
  };
}

function mapEvent(event: EspnEvent, league: (typeof LEAGUES)[number]): FootballMatch | null {
  const competitors = event.competitions?.[0]?.competitors ?? [];
  const home = competitors.find((c) => c.homeAway === "home");
  const away = competitors.find((c) => c.homeAway === "away");
  if (!event.id || !event.date || !home || !away || Number.isNaN(Date.parse(event.date))) return null;

  const state = event.status?.type?.state;
  const status: MatchStatus = state === "in" ? "live" : state === "post" ? "finished" : "scheduled";
  const score = (value?: string) => {
    if (status === "scheduled" || value == null || value.trim() === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const competition = event.competitions?.[0];
  return {
    id: `${league.id}:${event.id}`,
    eventId: event.id, leagueId: league.id, leagueName: league.name, leagueCountry: league.country,
    startTime: event.date, status,
    statusDetail: status === "live" ? (event.status?.displayClock || event.status?.type?.shortDetail || "LIVE") : status === "finished" ? "FT" : "Sắp diễn ra",
    home: teamFromEspn(home), away: teamFromEspn(away),
    homeScore: score(home.score), awayScore: score(away.score),
    venue: competition?.venue?.fullName ?? null,
    broadcasters: [...new Set((competition?.broadcasts ?? []).flatMap((b) => b.names ?? []))],
    matchUrl: `https://www.espn.com/soccer/match/_/gameId/${event.id}`,
    source: "ESPN",
  };
}

async function fetchEspn(league: (typeof LEAGUES)[number], day: string): Promise<FootballMatch[]> {
  const dateParam = day.replaceAll("-", "");
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard?dates=${dateParam}&limit=100`,
    { next: { revalidate: 90 }, signal: AbortSignal.timeout(9500), headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`ESPN ${league.id}: HTTP ${response.status}`);
  const data = (await response.json()) as { events?: EspnEvent[] };
  if (!Array.isArray(data.events)) throw new Error(`ESPN ${league.id}: JSON không hợp lệ`);
  return data.events.flatMap((event) => {
    const match = mapEvent(event, league);
    return match ? [match] : [];
  });
}

interface OpenLigaMatch {
  matchID: number;
  matchDateTimeUTC?: string;
  matchIsFinished: boolean;
  team1?: { teamId?: number; teamName?: string; shortName?: string; teamIconUrl?: string };
  team2?: { teamId?: number; teamName?: string; shortName?: string; teamIconUrl?: string };
  matchResults?: Array<{ pointsTeam1?: number; pointsTeam2?: number; resultOrderID?: number }>;
  location?: { locationStadium?: string };
}
async function fetchGermanBackup(date: string): Promise<FootballMatch[]> {
  const season = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0);
  const response = await fetch(`https://api.openligadb.de/getmatchdata/bl1/${season}`, {
    next: { revalidate: 300 }, signal: AbortSignal.timeout(9500),
  });
  if (!response.ok) throw new Error(`OpenLigaDB HTTP ${response.status}`);
  const data = (await response.json()) as OpenLigaMatch[];
  if (!Array.isArray(data)) throw new Error("OpenLigaDB JSON không hợp lệ");
  return data.flatMap((entry) => {
    if (!entry.team1 || !entry.team2 || !entry.matchDateTimeUTC) return [];
    const time = entry.matchDateTimeUTC.endsWith("Z") ? entry.matchDateTimeUTC : `${entry.matchDateTimeUTC}Z`;
    if (Number.isNaN(Date.parse(time)) || vietnamDate(time) !== date) return [];
    const score = entry.matchResults?.find((r) => r.resultOrderID === 2) ?? entry.matchResults?.at(-1);
    const toTeam = (team: NonNullable<OpenLigaMatch["team1"]>): FootballTeam => ({
      id: String(team.teamId ?? ""), name: team.teamName ?? "Chưa xác định",
      shortName: team.shortName ?? team.teamName ?? "TBD",
      logo: team.teamIconUrl?.startsWith("https://") ? team.teamIconUrl : null,
    });
    return [{
      id: `openligadb:${entry.matchID}`, eventId: String(entry.matchID), leagueId: "ger.1",
      leagueName: "Bundesliga", leagueCountry: "Đức", startTime: time,
      status: entry.matchIsFinished ? "finished" as const : "scheduled" as const,
      statusDetail: entry.matchIsFinished ? "FT" : "Sắp diễn ra",
      home: toTeam(entry.team1), away: toTeam(entry.team2),
      homeScore: entry.matchIsFinished ? score?.pointsTeam1 ?? null : null,
      awayScore: entry.matchIsFinished ? score?.pointsTeam2 ?? null : null,
      venue: entry.location?.locationStadium ?? null, broadcasters: [],
      matchUrl: null, source: "OpenLigaDB" as const,
    }];
  });
}

export async function getMatchFeed(date: string): Promise<MatchFeed> {
  // 00:00 Vietnamese local time = 17:00 UTC on the previous calendar day.
  const days = [shiftDate(date, -1), date];
  const tasks = LEAGUES.flatMap((league) => days.map((day) => ({ league, day })));
  // Bound upstream traffic as the competition list grows. Keep result order for error attribution.
  const responses = await settleLimited(tasks.map(({ league, day }) => () => fetchEspn(league, day)), 16);
  const matches: FootballMatch[] = [];
  const errors: string[] = [];
  const germanSuccess = responses.some((r, i) => tasks[i].league.id === "ger.1" && r.status === "fulfilled");
  responses.forEach((result, index) => {
    if (result.status === "fulfilled") matches.push(...result.value);
    else errors.push(`${tasks[index].league.name}: không thể tải dữ liệu`);
  });
  if (!germanSuccess) {
    try { matches.push(...await fetchGermanBackup(date)); }
    catch { errors.push("OpenLigaDB: không thể tải dữ liệu"); }
  }
  const seen = new Set<string>();
  const filtered = matches.filter((m) => vietnamDate(m.startTime) === date)
    .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  return {
    date, matches: filtered, updatedAt: new Date().toISOString(),
    sources: [...new Set(filtered.map((m) => m.source))], partial: errors.length > 0,
    errors: [...new Set(errors)],
  };
}
