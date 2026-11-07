import test from "node:test";
import assert from "node:assert/strict";
import { leagueLogoImageUrl, teamLogoImageUrl } from "../src/lib/football/team-logo.ts";

test("ESPN soccer crests request only the pixels needed at two-times density", () => {
  const original = "https://a.espncdn.com/i/teamlogos/soccer/500/817.png";
  const row = new URL(teamLogoImageUrl(original, 27));
  const hero = new URL(teamLogoImageUrl(original, 104));
  assert.equal(row.origin, "https://a.espncdn.com");
  assert.equal(row.pathname, "/combiner/i");
  assert.equal(row.searchParams.get("img"), "/i/teamlogos/soccer/500/817.png");
  assert.equal(row.searchParams.get("w"), "64");
  assert.equal(row.searchParams.get("h"), "64");
  assert.equal(hero.searchParams.get("w"), "208");
  assert.equal(hero.searchParams.get("h"), "208");
});

test("unknown logo hosts and unexpected paths remain untouched", () => {
  const values = [
    "https://vpf.vn/logo.png",
    "https://a.espncdn.com.evil.example/i/teamlogos/soccer/500/817.png",
    "https://a.espncdn.com/i/teamlogos/soccer/500/817.png?foo=bar",
    "https://a.espncdn.com/i/teamlogos/soccer/500/../../other.png",
    "not a url",
  ];
  for (const value of values) assert.equal(teamLogoImageUrl(value, 27), value);
});

test("ESPN league crests are resized using the same trusted combiner", () => {
  const source = "https://a.espncdn.com/i/leaguelogos/soccer/500/2395.png";
  const resized = new URL(leagueLogoImageUrl(source, 39));
  assert.equal(resized.pathname, "/combiner/i");
  assert.equal(resized.searchParams.get("img"), "/i/leaguelogos/soccer/500/2395.png");
  assert.equal(resized.searchParams.get("w"), "80");
  assert.equal(leagueLogoImageUrl("https://vpf.vn/wp-content/uploads/2026/09/Thumb-VL1.jpg", 39),
    "https://vpf.vn/wp-content/uploads/2026/09/Thumb-VL1.jpg");
  assert.equal(teamLogoImageUrl(source, 39), source);
});
