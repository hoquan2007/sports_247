import assert from "node:assert/strict";
import test from "node:test";
import { detectGoalEvent } from "../src/lib/football/goal-event.ts";

function fixture(homeScore, awayScore, status = "live") {
  return { id: "m1", status, homeScore, awayScore, home: { name: "Hà Nội FC" }, away: { name: "Hải Phòng FC" } };
}

test("announce actual increase in home or away score", () => {
  assert.deepEqual(detectGoalEvent([fixture(0, 0)], [fixture(1, 0)]), { matchId: "m1", teamName: "Hà Nội FC", score: "1–0" });
  assert.deepEqual(detectGoalEvent([fixture(1, 0)], [fixture(1, 1)]), { matchId: "m1", teamName: "Hải Phòng FC", score: "1–1" });
});

test("no fake goal on initial load, no score change, missing score or negative correction", () => {
  assert.equal(detectGoalEvent([], [fixture(3, 1)]), null);
  assert.equal(detectGoalEvent([fixture(1, 0)], [fixture(1, 0)]), null);
  assert.equal(detectGoalEvent([fixture(null, 0)], [fixture(1, 0)]), null);
  assert.equal(detectGoalEvent([fixture(2, 0)], [fixture(1, 0)]), null);
  assert.equal(detectGoalEvent([fixture(0, 0, "scheduled")], [fixture(0, 0, "scheduled")]), null);
});
