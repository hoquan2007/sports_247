import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftDate, vietnamDate } from '../src/lib/football/leagues.ts';

test('Vietnam local day spans two UTC calendar days', () => {
  assert.equal(vietnamDate('2026-10-30T16:59:59Z'), '2026-10-30');
  assert.equal(vietnamDate('2026-10-30T17:00:00Z'), '2026-10-31');
  assert.equal(vietnamDate('2026-10-31T16:59:59Z'), '2026-10-31');
  assert.equal(vietnamDate('2026-10-31T17:00:00Z'), '2026-11-01');
});

test('Date navigation correctly crosses months, years and leap days', () => {
  assert.equal(shiftDate('2026-10-31', 1), '2026-11-01');
  assert.equal(shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(shiftDate('2028-02-28', 1), '2028-02-29');
  assert.equal(shiftDate('2028-02-29', 1), '2028-03-01');
});
