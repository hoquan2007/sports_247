import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUES } from '../src/lib/football/leagues.ts';

test('Every enabled competition has a unique ESPN logo and identifier', () => {
  assert.equal(LEAGUES.length, 17);
  assert.equal(new Set(LEAGUES.map((league) => league.id)).size, LEAGUES.length);
  assert.equal(new Set(LEAGUES.map((league) => league.logo)).size, LEAGUES.length);
  LEAGUES.forEach((league) => {
    assert.match(league.logo, /^https:\/\/a\.espncdn\.com\/i\/leaguelogos\/soccer\/500\/\d+\.png$/);
    assert.ok(league.name && league.short);
  });
});
