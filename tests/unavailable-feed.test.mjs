import test from "node:test";
import assert from "node:assert/strict";
import { unavailableMatchFeed } from "../src/lib/football/unavailable-feed.ts";

test("aggregator failure produces explicit partial feed while homepage remains renderable", () => {
  const feed = unavailableMatchFeed("2026-11-02", ["eng.1", "esp.1"], ["vie.1", "vie.2"], "2026-11-02T05:00:00Z");
  assert.equal(feed.date, "2026-11-02");
  assert.equal(feed.updatedAt, "2026-11-02T05:00:00Z");
  assert.deepEqual(feed.matches, []);
  assert.deepEqual(feed.sources, []);
  assert.equal(feed.partial, true);
  assert.deepEqual(feed.failedLeagues, ["eng.1", "esp.1"]);
  assert.deepEqual(feed.pendingLeagues, ["vie.1", "vie.2"]);
  assert.ok(feed.errors[0].includes("thử lại"));
});
