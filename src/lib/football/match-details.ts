/** Normalized, optional detail fields from ESPN's undocumented soccer summary feed. */
import { normalizeEspnStatus } from "./espn-status.ts";
export interface DetailStatistic {
  key: string;
  label: string;
  home: string;
  away: string;
  homeValue: number | null;
  awayValue: number | null;
}

export interface DetailEvent {
  id: string;
  minute: string;
  teamId: string | null;
  kind: "goal" | "card" | "substitution" | "other";
  title: string;
  description: string | null;
}

export interface DetailPlayer {
  id: string;
  name: string;
  number: string | null;
  position: string | null;
}

export interface DetailLineup {
  teamId: string;
  formation: string | null;
  starters: DetailPlayer[];
  substitutes: DetailPlayer[];
}

export interface DetailCommentary {
  id: string;
  minute: string;
  text: string;
}

export interface HeadToHeadMatch {
  id: string;
  date: string;
  homeId: string;
  awayId: string;
  homeScore: number;
  awayScore: number;
}

export interface MatchDetails {
  homeId: string | null;
  awayId: string | null;
  statistics: DetailStatistic[];
  events: DetailEvent[];
  lineups: DetailLineup[];
  commentary: DetailCommentary[];
  headToHead: HeadToHeadMatch[];
  attendance: string | null;
  referee: string | null;
  updatedAt: string;
}

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const str = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};
const prop = (value: unknown, key: string): unknown => Array.isArray(value) && /^\d+$/.test(key)
  ? value[Number(key)] : object(value)[key];
const nested = (value: unknown, ...keys: string[]): unknown => keys.reduce(prop, value);
const number = (value: string): number | null => {
  const match = value.replaceAll(",", "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const STAT_NAMES: Record<string, string> = {
  possession: "Kiểm soát bóng", possessionPct: "Kiểm soát bóng", ballPossession: "Kiểm soát bóng",
  totalShots: "Tổng cú sút", shots: "Tổng cú sút", shotsOnTarget: "Sút trúng đích",
  shotsOnGoal: "Sút trúng đích", fouls: "Phạm lỗi", foulsCommitted: "Phạm lỗi",
  yellowCards: "Thẻ vàng", redCards: "Thẻ đỏ", cornerKicks: "Phạt góc", corners: "Phạt góc",
  offsides: "Việt vị", saves: "Cứu thua", goalkeeperSaves: "Cứu thua",
  expectedGoals: "Bàn thắng kỳ vọng (xG)", xG: "Bàn thắng kỳ vọng (xG)",
  totalPasses: "Tổng đường chuyền", accuratePasses: "Chuyền chính xác",
  passAccuracy: "Tỷ lệ chuyền chính xác",
};
const STAT_PRIORITY = Object.keys(STAT_NAMES);

function teamId(value: unknown): string | null {
  return str(nested(value, "team", "id")) ?? str(prop(value, "teamId")) ?? str(prop(value, "id"));
}

function parseStatistics(value: unknown, homeId: string | null, awayId: string | null): DetailStatistic[] {
  const teams = list(nested(value, "boxscore", "teams"));
  const competitionTeams = list(nested(value, "header", "competitions", "0", "competitors"));
  // Header competitor statistics may be present when boxscore is absent.
  const candidates = teams.length > 0 ? teams : competitionTeams;
  const byTeam = (id: string | null, side: "home" | "away") => candidates.find((entry) =>
    (id && teamId(entry) === id) || (!id && prop(entry, "homeAway") === side));
  const home = byTeam(homeId, "home");
  const away = byTeam(awayId, "away");
  if (!home || !away || home === away) return [];

  const extract = (entry: unknown) => {
    const results = new Map<string, { label: string; value: string }>();
    for (const stat of list(prop(entry, "statistics"))) {
      const raw = str(prop(stat, "name")) ?? str(prop(stat, "abbreviation"));
      const key = raw?.replace(/[^\w]/g, "").toLowerCase();
      if (!key) continue;
      const value = str(prop(stat, "displayValue")) ?? str(prop(stat, "value"));
      if (value) results.set(key, { label: str(prop(stat, "label")) ?? raw ?? key, value });
    }
    return results;
  };
  const homeStats = extract(home);
  const awayStats = extract(away);
  const keys = [...homeStats.keys()].filter((key) => awayStats.has(key));
  keys.sort((a, b) => {
    const priority = (key: string) => {
      const index = STAT_PRIORITY.findIndex((name) => name.toLowerCase() === key);
      return index < 0 ? 100 : index;
    };
    return priority(a) - priority(b);
  });
  return keys.slice(0, 24).map((key) => {
    const left = homeStats.get(key)!;
    const right = awayStats.get(key)!;
    const matchingLabel = Object.entries(STAT_NAMES).find(([name]) => name.toLowerCase() === key)?.[1];
    return {
      key, label: matchingLabel ?? left.label,
      home: left.value, away: right.value,
      homeValue: number(left.value), awayValue: number(right.value),
    };
  });
}

function parseEvents(value: unknown): DetailEvent[] {
  const sources = [
    prop(value, "keyEvents"),
    nested(value, "header", "competitions", "0", "details"),
    prop(value, "plays"),
  ];
  const events = list(sources.find((source) => list(source).length > 0));
  return events.slice(0, 150).flatMap((entry, index) => {
    const type = (str(nested(entry, "type", "text")) ?? str(nested(entry, "type", "name")) ??
      str(nested(entry, "type", "type")) ?? str(prop(entry, "type")) ?? "").toLowerCase();
    const athlete = str(nested(entry, "participants", "0", "athlete", "displayName")) ??
      str(nested(entry, "athletesInvolved", "0", "displayName")) ??
      str(nested(entry, "athletesInvolved", "0", "athlete", "displayName")) ??
      str(nested(entry, "athlete", "displayName"));
    const headline = str(prop(entry, "text")) ?? str(prop(entry, "description"));
    const title = str(prop(entry, "shortText")) ?? str(nested(entry, "type", "text")) ?? athlete ?? headline;
    if (!title) return [];
    const minute = str(nested(entry, "clock", "displayValue")) ?? str(prop(entry, "clock")) ??
      str(prop(entry, "minute")) ?? "—";
    const isGoal = /goal|penalty scored|own goal/.test(type) || prop(entry, "scoringPlay") === true;
    const isCard = /card|booking|yellow|red/.test(type);
    const isSub = /substitut/.test(type);
    return [{
      id: str(prop(entry, "id")) ?? `event-${index}`,
      minute, teamId: str(nested(entry, "team", "id")) ?? str(prop(entry, "teamId")),
      kind: isGoal ? "goal" as const : isCard ? "card" as const : isSub ? "substitution" as const : "other" as const,
      title: athlete && !title.toLowerCase().includes(athlete.toLowerCase()) ? `${title} · ${athlete}` : title,
      description: headline && headline !== title ? headline : null,
    }];
  });
}

function parseLineups(value: unknown, homeId: string | null, awayId: string | null): DetailLineup[] {
  const rosters = list(prop(value, "rosters"));
  const playerTeams = list(nested(value, "boxscore", "players"));
  const formTeams = list(nested(value, "boxscore", "form"));
  const entries = rosters.length > 0 ? rosters : playerTeams;
  return entries.flatMap((entry, index) => {
    // Soccer summaries often pair rosters[] with boxscore.form[] by index,
    // without repeating the team id in the roster item itself.
    const id = teamId(entry) ?? teamId(formTeams[index]) ??
      (entries.length === 2 ? (index === 0 ? homeId : awayId) : null);
    if (!id || (id !== homeId && id !== awayId)) return [];
    const roster = list(prop(entry, "roster"));
    // Some soccer fixtures expose player records under boxscore.players[*].statistics[*].athletes.
    const athletes = roster.length ? roster : list(prop(entry, "players"));
    const players = athletes.flatMap((item, index) => {
      const athlete = object(prop(item, "athlete"));
      const name = str(athlete.displayName) ?? str(athlete.fullName) ?? str(prop(item, "displayName"));
      if (!name) return [];
      const starter = prop(item, "starter") === true || prop(item, "starting") === true;
      return [{
        starter, index, player: {
          id: str(athlete.id) ?? `${id}-${index}`, name,
          number: str(prop(item, "jersey")) ?? str(athlete.jersey),
          position: str(nested(item, "position", "abbreviation")) ?? str(nested(item, "position", "displayName")) ??
            str(nested(athlete, "position", "abbreviation")),
        },
      }];
    });
    return [{
      teamId: id,
      formation: str(prop(entry, "formation")) ?? str(prop(formTeams[index], "formation")),
      starters: players.filter((p) => p.starter).map((p) => p.player),
      substitutes: players.filter((p) => !p.starter).map((p) => p.player),
    }];
  });
}

function parseCommentary(value: unknown): DetailCommentary[] {
  const commentarySource = prop(value, "commentary");
  const commentary = Array.isArray(commentarySource) ? commentarySource : list(prop(commentarySource, "items"));
  return commentary.slice(0, 120).flatMap((item, index) => {
    const message = str(prop(item, "text")) ?? str(prop(item, "description")) ?? str(prop(item, "comment"));
    if (!message) return [];
    return [{
      id: str(prop(item, "id")) ?? `comment-${index}`,
      minute: str(nested(item, "clock", "displayValue")) ?? str(prop(item, "minute")) ?? "—",
      text: message,
    }];
  });
}

/** ESPN seasonseries may include other kinds of series; only retain completed games between these two clubs. */
function parseHeadToHead(value: unknown, homeId: string | null, awayId: string | null): HeadToHeadMatch[] {
  if (!homeId || !awayId || homeId === awayId) return [];
  const series = list(prop(value, "seasonseries")).find((entry) => prop(entry, "type") === "head-to-head");
  const seen = new Set<string>();
  return list(prop(series, "events")).flatMap((event) => {
    const id = str(prop(event, "id"));
    const date = str(prop(event, "date"));
    const competitors = list(prop(event, "competitors"));
    const home = competitors.find((team) => prop(team, "homeAway") === "home");
    const away = competitors.find((team) => prop(team, "homeAway") === "away");
    const eventHomeId = teamId(home);
    const eventAwayId = teamId(away);
    const allowed = [homeId, awayId];
    const eventStatus = prop(event, "status");
    const statusName = str(nested(event, "statusType", "name"))
      ?? str(nested(eventStatus, "type", "name")) ?? str(prop(eventStatus, "name"));
    const statusState = str(nested(event, "statusType", "state"))
      ?? (typeof eventStatus === "string" ? eventStatus :
        str(nested(eventStatus, "type", "state")) ?? str(prop(eventStatus, "state")));
    const completed = normalizeEspnStatus({ type: {
      name: statusName ?? undefined, state: statusState ?? undefined,
    } }).status === "finished";
    const homeScoreText = str(prop(home, "score"));
    const awayScoreText = str(prop(away, "score"));
    if (!id || seen.has(id) || !date || !Number.isFinite(Date.parse(date)) || !completed ||
        !eventHomeId || !eventAwayId || eventHomeId === eventAwayId ||
        !allowed.includes(eventHomeId) || !allowed.includes(eventAwayId) ||
        !homeScoreText || !awayScoreText || !/^\d{1,3}$/.test(homeScoreText) || !/^\d{1,3}$/.test(awayScoreText)) return [];
    seen.add(id);
    return [{ id, date, homeId: eventHomeId, awayId: eventAwayId,
      homeScore: Number(homeScoreText), awayScore: Number(awayScoreText) }];
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 5);
}

export function parseEspnMatchDetails(value: unknown): MatchDetails {
  const competitors = list(nested(value, "header", "competitions"))
    .flatMap((competition) => list(prop(competition, "competitors")));
  const homeId = teamId(competitors.find((comp) => prop(comp, "homeAway") === "home"));
  const awayId = teamId(competitors.find((comp) => prop(comp, "homeAway") === "away"));
  const gameInfo = prop(value, "gameInfo");
  const officials = list(prop(gameInfo, "officials"));
  const referee = officials.find((entry) => /referee/i.test(str(nested(entry, "position", "name")) ?? str(prop(entry, "position")) ?? ""));
  return {
    homeId, awayId,
    statistics: parseStatistics(value, homeId, awayId),
    events: parseEvents(value),
    lineups: parseLineups(value, homeId, awayId),
    commentary: parseCommentary(value),
    headToHead: parseHeadToHead(value, homeId, awayId),
    attendance: str(prop(gameInfo, "attendance")),
    referee: str(nested(referee, "athlete", "displayName")) ?? str(prop(referee, "displayName")),
    updatedAt: new Date().toISOString(),
  };
}

export async function getEspnMatchDetails(leagueId: string, eventId: string): Promise<MatchDetails> {
  const response = await fetch(
    `https://site.api.espn.com/apis/site/v2/sports/soccer/${leagueId}/summary?event=${eventId}`,
    { next: { revalidate: 60 }, signal: AbortSignal.timeout(9500), headers: { Accept: "application/json" } },
  );
  if (!response.ok) throw new Error(`ESPN summary HTTP ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("ESPN summary không hợp lệ");
  return parseEspnMatchDetails(payload);
}
