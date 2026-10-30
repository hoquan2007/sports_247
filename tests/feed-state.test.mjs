import assert from "node:assert/strict";
import test from "node:test";
import { reconcileFeed } from "../src/lib/football/feed-state.ts";

function fixture(id, startTime = "2026-10-31T15:00:00Z", homeScore = 0) {
  return { id, startTime, homeScore, source: "ESPN" };
}
function feed(date, matches, partial = false) {
  return { date, matches, partial, sources: ["ESPN"], updatedAt: "2026-10-31T00:00:00Z", errors: [] };
}

test("partial provider responses retain missing fixtures and accept fresh scores", () => {
  const previous = feed("2026-10-31", [fixture("a", undefined, 0), fixture("b")]);
  const incoming = feed("2026-10-31", [fixture("a", undefined, 1)], true);
  const merged = reconcileFeed(previous, incoming);
  assert.equal(merged.partial, true);
  assert.deepEqual(merged.matches.map((match) => match.id), ["a", "b"]);
  assert.equal(merged.matches[0].homeScore, 1);
  assert.deepEqual(previous.matches.map((match) => match.homeScore), [0, 0]);
});

test("complete responses and date switches never retain old fixtures", () => {
  const previous = feed("2026-10-31", [fixture("a"), fixture("b")]);
  assert.deepEqual(reconcileFeed(previous, feed("2026-10-31", [fixture("a")])).matches.map((m) => m.id), ["a"]);
  assert.deepEqual(reconcileFeed(previous, feed("2026-11-01", [fixture("c")], true)).matches.map((m) => m.id), ["c"]);
});
