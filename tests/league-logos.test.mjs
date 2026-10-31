import test from 'node:test';
import assert from 'node:assert/strict';
import { LEAGUES } from '../src/lib/football/leagues.ts';

test('Every enabled competition has a unique ESPN logo and identifier', () => {
  assert.ok(LEAGUES.length >= 18);
  assert.ok(LEAGUES.some((league) => league.id === 'uefa.nations' && league.logo.endsWith('/2395.png')));
  assert.equal(new Set(LEAGUES.map((league) => league.id)).size, LEAGUES.length);
  assert.equal(new Set(LEAGUES.map((league) => league.logo)).size, LEAGUES.length);
  LEAGUES.forEach((league) => {
    assert.match(league.logo, /^https:\/\/a\.espncdn\.com\/i\/leaguelogos\/soccer\/500\/\d+\.png$/);
    assert.ok(league.name && league.short);
  });
});
