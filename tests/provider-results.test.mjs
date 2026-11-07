import assert from 'node:assert/strict';
import test from 'node:test';
import { collectEspnOutcomes, markProviderRecovered } from '../src/lib/football/provider-results.ts';

const tasks = [
  { league: { id: 'eng.1', name: 'Premier League' }, day: '2026-10-30' },
  { league: { id: 'eng.1', name: 'Premier League' }, day: '2026-10-31' },
  { league: { id: 'esp.1', name: 'La Liga' }, day: '2026-10-30' },
  { league: { id: 'esp.1', name: 'La Liga' }, day: '2026-10-31' },
];

test('a single failed UTC day is attributed to its league without losing other results', () => {
  const outcomes = [
    { status: 'rejected', reason: new Error('503') },
    { status: 'fulfilled', value: ['eng-live'] },
    { status: 'fulfilled', value: [] },
    { status: 'fulfilled', value: ['esp-live'] },
  ];
  const result = collectEspnOutcomes(tasks, outcomes);
  assert.deepEqual(result.matches, ['eng-live', 'esp-live']);
  assert.deepEqual(result.failedLeagues, ['eng.1']);
  assert.deepEqual(result.errors, ['Premier League: không thể tải dữ liệu']);
});

test('both UTC days failing produce one failed league, and another league stays healthy', () => {
  const result = collectEspnOutcomes(tasks, [
    { status: 'rejected', reason: null }, { status: 'rejected', reason: null },
    { status: 'fulfilled', value: [] }, { status: 'fulfilled', value: [] },
  ]);
  assert.deepEqual(result.failedLeagues, ['eng.1']);
  assert.equal(result.errors.length, 2);
  assert.deepEqual(result.matches, []);
});

test('all successful leagues with no fixtures are not classified as failed', () => {
  const result = collectEspnOutcomes(tasks, tasks.map(() => ({ status: 'fulfilled', value: [] })));
  assert.deepEqual(result.failedLeagues, []);
  assert.deepEqual(result.errors, []);
});

test('partially malformed ESPN day retains valid fixtures and flags its league', () => {
  const result = collectEspnOutcomes(tasks, [
    { status: 'fulfilled', value: { matches: ['eng-ok'], incomplete: true } },
    { status: 'fulfilled', value: { matches: ['eng-later'], incomplete: false } },
    { status: 'fulfilled', value: [] },
    { status: 'fulfilled', value: { matches: ['esp-ok'], incomplete: false } },
  ]);
  assert.deepEqual(result.matches, ['eng-ok', 'eng-later', 'esp-ok']);
  assert.deepEqual(result.failedLeagues, ['eng.1']);
  assert.deepEqual(result.errors, ['Premier League: nguồn ESPN trả về dữ liệu chưa đầy đủ']);
  assert.deepEqual(result.issues, [{ leagueId: 'eng.1', message: result.errors[0] }]);
});

test('provider issue attribution permits recovering Bundesliga without removing another league warning', () => {
  const result = collectEspnOutcomes(tasks, [
    { status: 'rejected', reason: new Error('timeout') },
    { status: 'fulfilled', value: [] },
    { status: 'rejected', reason: new Error('503') },
    { status: 'fulfilled', value: [] },
  ]);
  assert.deepEqual(result.issues.map((issue) => issue.leagueId), ['eng.1', 'esp.1']);
  assert.deepEqual(result.issues.filter((issue) => issue.leagueId !== 'eng.1').map((issue) => issue.message),
    ['La Liga: không thể tải dữ liệu']);
});

test('a complete fallback clears every warning for its league and leaves unrelated failures', () => {
  const failed = new Set(['ger.1', 'eng.1']);
  const issues = [
    { leagueId: 'ger.1', message: 'Bundesliga: ngày đầu lỗi' },
    { leagueId: 'eng.1', message: 'Premier League: thiếu dữ liệu' },
    { leagueId: 'ger.1', message: 'Bundesliga: ngày sau lỗi' },
  ];
  markProviderRecovered('ger.1', failed, issues);
  assert.deepEqual([...failed], ['eng.1']);
  assert.deepEqual(issues, [{ leagueId: 'eng.1', message: 'Premier League: thiếu dữ liệu' }]);
});
