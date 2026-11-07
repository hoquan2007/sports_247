import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidMatchDate, parseMatchFilters, serializeMatchFilters } from '../src/lib/football/shareable-filters.ts';

const fallbackDate = '2026-11-03';

test('shared filter URL round-trips date, Vietnam league, status and Unicode search', () => {
  const original = { date: '2026-11-15', league: 'vie.1', status: 'finished', query: 'Hà Nội FC' };
  const params = serializeMatchFilters(original);
  assert.equal(params.get('date'), original.date);
  assert.equal(params.get('league'), original.league);
  assert.equal(params.get('status'), original.status);
  assert.deepEqual(parseMatchFilters(params, fallbackDate), original);
});

test('default filters omit nonessential URL parameters', () => {
  const params = serializeMatchFilters({ date: fallbackDate, league: 'all', status: 'all', query: '  ' });
  assert.equal(params.toString(), `date=${fallbackDate}`);
  assert.deepEqual(parseMatchFilters(new URLSearchParams(), fallbackDate), {
    date: fallbackDate, league: 'all', status: 'all', query: '',
  });
});

test('invalid dates and unknown league/status values cannot enter UI state', () => {
  for (const date of ['2026-02-30', '2026-13-01', '0000-01-01', '2026-1-1', 'not-a-date']) {
    assert.equal(isValidMatchDate(date), false, date);
    const params = new URLSearchParams({ date, league: '__unknown', status: 'other' });
    assert.deepEqual(parseMatchFilters(params, fallbackDate), {
      date: fallbackDate, league: 'all', status: 'all', query: '',
    });
  }
  assert.equal(isValidMatchDate('2028-02-29'), true);
});

test('search query is safely limited and parsed as ordinary text', () => {
  const params = new URLSearchParams({ q: `  ${'a'.repeat(200)}  ` });
  assert.equal(parseMatchFilters(params, fallbackDate).query.length, 100);
  const text = '<b>& Barcelona';
  const serialized = serializeMatchFilters({ date: fallbackDate, league: 'esp.1', status: 'live', query: text });
  assert.equal(parseMatchFilters(serialized, fallbackDate).query, text);
});
