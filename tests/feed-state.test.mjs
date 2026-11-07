import assert from "node:assert/strict";
import test from "node:test";
import { reconcileFeed } from "../src/lib/football/feed-state.ts";

function fixture(id, leagueId = "eng.1", homeScore = 0, source = "ESPN") {
  return { id, leagueId, startTime: "2026-10-31T15:00:00Z", homeScore, source };
}
function feed(date, matches, { partial = false, failedLeagues = [] } = {}) {
  return { date, matches, partial, failedLeagues,
    sources: [...new Set(matches.map((m) => m.source))],
    updatedAt: "2026-10-31T00:00:00Z", errors: [] };
}

test("a failed ESPN league retains only its own missing fixtures, and fresh scores win", () => {
  const previous = feed("2026-10-31", [
    fixture("eng-old"), fixture("eng-fresh", "eng.1", 0), fixture("esp-old", "esp.1"),
  ]);
  const incoming = feed("2026-10-31", [
    fixture("eng-fresh", "eng.1", 2), fixture("esp-fresh", "esp.1", 1),
  ], { partial: true, failedLeagues: ["eng.1"] });
  const merged = reconcileFeed(previous, incoming);
  assert.equal(merged.partial, true);
  assert.deepEqual(merged.matches.map((match) => match.id), ["eng-old", "eng-fresh", "esp-fresh"]);
  assert.equal(merged.matches.find((match) => match.id === "eng-fresh").homeScore, 2);
  assert.equal(previous.matches[1].homeScore, 0);
});

test("a failed Vietnamese provider cannot resurrect removed ESPN fixtures", () => {
  const previous = feed("2026-10-31", [
    fixture("eng-stale"), fixture("vie-old", "vie.2", 1, "API-Football"),
  ]);
  const incoming = feed("2026-10-31", [fixture("eng-current")],
    { partial: true, failedLeagues: ["vie.2"] });
  const merged = reconcileFeed(previous, incoming);
  assert.deepEqual(merged.matches.map((match) => match.id), ["vie-old", "eng-current"]);
  assert.deepEqual(merged.sources, ["API-Football", "ESPN"]);
});

test("partial response without league attribution cannot resurrect old matches", () => {
  const previous = feed("2026-10-31", [fixture("old")]);
  const incoming = feed("2026-10-31", [], { partial: true });
  assert.equal(reconcileFeed(previous, incoming), incoming);
});

test("complete responses and date switches never retain old fixtures", () => {
  const previous = feed("2026-10-31", [fixture("a"), fixture("b")]);
  assert.deepEqual(reconcileFeed(previous, feed("2026-10-31", [fixture("a")])).matches.map((m) => m.id), ["a"]);
  assert.deepEqual(reconcileFeed(previous, feed("2026-11-01", [fixture("c")],
    { partial: true, failedLeagues: ["eng.1"] })).matches.map((m) => m.id), ["c"]);
});
