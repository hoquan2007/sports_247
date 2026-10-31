/** Inspect the real local matches endpoint for missing club crests and metadata.
 * Usage: npm run audit:data -- 2026-10-31
 * Start the app first or override SPORTS247_BASE_URL.
 */
import { LEAGUES, vietnamDate } from '../src/lib/football/leagues.ts';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export function summarizeDataCoverage(feed) {
  if (!feed || !Array.isArray(feed.matches) || typeof feed.partial !== 'boolean') {
    throw new TypeError('Unexpected matches API response');
  }

  const competitions = LEAGUES.map((league) => {
    const games = feed.matches.filter((match) => match.leagueId === league.id);
    return {
      id: league.id,
      name: league.name,
      fixtures: games.length,
      crestAvailable: Boolean(league.logo),
      clubCrestsMissing: games.reduce((count, game) => count + Number(!game.home?.logo) + Number(!game.away?.logo), 0),
      stadiumsMissing: games.filter((game) => !game.venue).length,
      broadcasterFieldsMissing: games.filter((game) => !Array.isArray(game.broadcasters) || !game.broadcasters.length).length,
    };
  });
  const matched = competitions.reduce((count, item) => count + item.fixtures, 0);
  const uniqueMatchIds = new Set(feed.matches.map((match) => match.id));
  const timestamp = Date.parse(feed.updatedAt ?? '');
  const withNoFixtures = competitions.filter((item) => item.fixtures === 0).map((item) => item.id);
  return {
    date: feed.date,
    partial: feed.partial,
    providerFailures: Array.isArray(feed.errors) ? feed.errors.length : 0,
    providerFailureMessages: Array.isArray(feed.errors) ? feed.errors : [],
    updatedAt: Number.isFinite(timestamp) ? feed.updatedAt : null,
    fixtures: feed.matches.length,
    duplicateMatchIds: feed.matches.length - uniqueMatchIds.size,
    fixturesInKnownLeagues: matched,
    fixturesWithUnknownLeague: feed.matches.length - matched,
    supportedLeagues: competitions.length,
    leagueCrestsMissing: competitions.filter((item) => !item.crestAvailable).map((item) => item.id),
    // A league with no games on a particular day is not necessarily a missing provider.
    leaguesWithNoFixturesToday: withNoFixtures,
    clubCrestsMissing: competitions.reduce((sum, item) => sum + item.clubCrestsMissing, 0),
    stadiumsMissing: competitions.reduce((sum, item) => sum + item.stadiumsMissing, 0),
    broadcasterFieldsMissing: competitions.reduce((sum, item) => sum + item.broadcasterFieldsMissing, 0),
    competitions,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const date = process.argv[2] ?? vietnamDate(new Date());
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date) throw new Error('Expected real YYYY-MM-DD date');
  const base = process.env.SPORTS247_BASE_URL ?? 'http://127.0.0.1:3199';
  const url = new URL('/api/matches', base);
  url.searchParams.set('date', date);
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Matches endpoint returned HTTP ${response.status}`);
  const report = summarizeDataCoverage(await response.json());
  console.log(JSON.stringify(report, null, 2));
  if (report.leagueCrestsMissing.length || report.fixturesWithUnknownLeague || report.duplicateMatchIds) process.exitCode = 1;
}
