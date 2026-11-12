import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSearch } from '../src/lib/football/match-search.ts';

const match = {
  home: { name: 'Hà Nội FC', shortName: 'HN' },
  away: { name: 'Đà Nẵng', shortName: 'DN' },
  leagueName: 'V.League 1',
};

test('search matches Vietnamese names with or without accents', () => {
  assert.equal(matchesSearch(match, 'HA NOI'), true);
  assert.equal(matchesSearch(match, 'da nang'), true);
  assert.equal(matchesSearch(match, 'ĐÀ NẴNG'), true);
  assert.equal(matchesSearch(match, 'Đồng Nai'), false);
});

test('search matches team and league abbreviations and multiple words in any order', () => {
  assert.equal(matchesSearch(match, 'hn vl1', 'VL1'), true);
  assert.equal(matchesSearch(match, 'vl1 da nang', 'VL1'), true);
  assert.equal(matchesSearch(match, 'dn v league'), true);
  assert.equal(matchesSearch(match, 'vl2', 'VL1'), false);
  assert.equal(matchesSearch(match, 'hanoi', 'VL1'), false);
});

test('search handles empty queries, punctuation and decomposed unicode', () => {
  assert.equal(matchesSearch(match, '   '), true);
  assert.equal(matchesSearch(match, 'HÀ NỘI'), true);
  assert.equal(matchesSearch(match, 'v-league'), true);
  assert.equal(matchesSearch(match, '  @@@  '), false);
  assert.equal(matchesSearch(match, '⚽️'), false);
  assert.equal(matchesSearch(match, '...'), false);
});
