import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidMatchDate, parseMatchFilters, serializeMatchFilters } from '../src/lib/football/shareable-filters.ts';
import { shiftMonth } from '../src/lib/football/leagues.ts';

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
  for (const date of ['2026-02-30', '2026-13-01', '0000-01-01', '1899-12-31',
    '2101-01-01', '2026-1-1', 'not-a-date']) {
    assert.equal(isValidMatchDate(date), false, date);
    const params = new URLSearchParams({ date, league: '__unknown', status: 'other' });
    assert.deepEqual(parseMatchFilters(params, fallbackDate), {
      date: fallbackDate, league: 'all', status: 'all', query: '',
    });
  }
  assert.equal(isValidMatchDate('2028-02-29'), true);
  assert.equal(isValidMatchDate('1900-01-01'), true);
  assert.equal(isValidMatchDate('2100-12-31'), true);
});

test('search query is safely limited and parsed as ordinary text', () => {
  const params = new URLSearchParams({ q: `  ${'a'.repeat(200)}  ` });
  assert.equal(parseMatchFilters(params, fallbackDate).query.length, 100);
  const text = '<b>& Barcelona';
  const serialized = serializeMatchFilters({ date: fallbackDate, league: 'esp.1', status: 'live', query: text });
  assert.equal(parseMatchFilters(serialized, fallbackDate).query, text);
});

test('team link filter round-trips a valid provider identity and rejects malformed keys', () => {
  const original = { date: fallbackDate, league: 'all', status: 'all', query: '', team: 'ESPN|eng.1|22' };
  const serialized = serializeMatchFilters(original);
  assert.equal(serialized.get('team'), original.team);
  assert.deepEqual(parseMatchFilters(serialized, fallbackDate), original);
  for (const invalid of ['unknown|eng.1|22', 'ESPN|eng.1|', 'ESPN|eng.1|%XX']) {
    assert.equal(parseMatchFilters(new URLSearchParams({ team: invalid }), fallbackDate).team, undefined);
  }
});

test('month navigation preserves the day where possible and clamps month end', () => {
  assert.equal(shiftMonth('2028-01-31', 1), '2028-02-29');
  assert.equal(shiftMonth('2027-03-31', -1), '2027-02-28');
  assert.equal(shiftMonth('2026-12-30', 1), '2027-01-30');
  assert.equal(shiftMonth('2026-11-20', 1), '2026-12-20');
  assert.equal(shiftMonth('2026-12-20', -1), '2026-11-20');
  assert.equal(isValidMatchDate(shiftMonth('1900-01-01', -1)), false);
  assert.equal(isValidMatchDate(shiftMonth('2100-12-31', 1)), false);
});
