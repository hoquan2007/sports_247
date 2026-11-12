import { LEAGUES, shiftDate, vietnamDate } from "./leagues";
import { settleLimited } from "./settle-limited";
import type { FootballMatch, MatchFeed } from "./types";
import { getVietnamFeedConfig, getVietnamMatches } from "./vietnam";
import { VIETNAM_LEAGUES } from "./vietnam-leagues";
import { collectEspnOutcomes, markProviderRecovered } from "./provider-results";
import { parseEspnScoreboard } from "./espn-fixtures";
import { parseOpenLigaSeason } from "./openligadb-fixtures";
import { selectBundesligaBackup } from "./bundesliga-backup";

async function fetchEspn(league: (typeof LEAGUES)[number], day: string): Promise<{
  matches: FootballMatch[]; incomplete: boolean;
}> {
  const dateParam = day.replaceAll("-", "");
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${league.id}/scoreboard?dates=${dateParam}&limit=100`,
    { next: { revalidate: 90 }, signal: AbortSignal.timeout(9500), headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`ESPN ${league.id}: HTTP ${response.status}`);
  return parseEspnScoreboard(await response.json(), league);
}

async function fetchGermanBackup(date: string): Promise<{
  matches: FootballMatch[]; incomplete: boolean;
}> {
  const season = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0);
  const response = await fetch(`https://api.openligadb.de/getmatchdata/bl1/${season}`, {
    next: { revalidate: 300 }, signal: AbortSignal.timeout(9500),
  });
  if (!response.ok) throw new Error(`OpenLigaDB HTTP ${response.status}`);
  return parseOpenLigaSeason(await response.json(), date);
}

export async function getMatchFeed(date: string): Promise<MatchFeed> {
  // 00:00 Vietnamese local time = 17:00 UTC on the previous calendar day.
  const days = [shiftDate(date, -1), date];
  const tasks = LEAGUES.flatMap((league) => days.map((day) => ({ league, day })));
  // Bound upstream traffic as the competition list grows. Keep result order for error attribution.
  const responses = await settleLimited(tasks.map(({ league, day }) => () => fetchEspn(league, day)), 16);
  const { matches, issues, failedLeagues: espnFailures } = collectEspnOutcomes<FootballMatch>(tasks, responses);
  const failedEspnLeagues = new Set(espnFailures);
  const germanAttempts = responses.flatMap((response, index) => {
    if (tasks[index].league.id !== "ger.1") return [];
    return [{
      day: tasks[index].day,
      healthy: response.status === "fulfilled" && !response.value.incomplete,
      matches: response.status === "fulfilled" ? response.value.matches : [],
    }];
  });
  if (germanAttempts.some((attempt) => !attempt.healthy)) {
    try {
      const backup = await fetchGermanBackup(date);
      const supplemental = selectBundesligaBackup(germanAttempts, matches, backup);
      matches.push(...supplemental.matches);
      if (backup.incomplete) {
        issues.push({ leagueId: "ger.1", message: "OpenLigaDB: dữ liệu Bundesliga chưa đầy đủ" });
      } else if (supplemental.recovered) {
        markProviderRecovered("ger.1", failedEspnLeagues, issues);
      }
    }
    catch { issues.push({ leagueId: "ger.1", message: "OpenLigaDB: không thể tải dữ liệu" }); }
  }
  const errors = issues.map((issue) => issue.message);
  // Vietnam leagues use a separately licensed provider. Without its complete
  // configuration, do not emit empty/fabricated fixtures.
  const vietnamConfig = getVietnamFeedConfig();
  const failedLeagues: string[] = [...failedEspnLeagues];
  let failedVietnamLeagues: string[] = [];
  if (vietnamConfig) {
    const vietnam = await getVietnamMatches(date, vietnamConfig);
    matches.push(...vietnam.matches);
    errors.push(...vietnam.errors);
    failedLeagues.push(...vietnam.failedLeagues);
    failedVietnamLeagues = vietnam.failedLeagues;
  }
  const seen = new Set<string>();
  const filtered = matches.filter((m) => vietnamDate(m.startTime) === date)
    .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true; })
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime));
  return {
    date, matches: filtered, updatedAt: new Date().toISOString(),
    sources: [...new Set(filtered.map((m) => m.source))], partial: errors.length > 0,
    errors: [...new Set(errors)],
    pendingLeagues: vietnamConfig ? failedVietnamLeagues : VIETNAM_LEAGUES.map((league) => league.id),
    failedLeagues,
  };
}
