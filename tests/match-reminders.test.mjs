import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_REMINDER_SETTINGS, REMINDER_SENT_KEY, dueMatchReminders, markReminderSent,
  parseReminderSettings, reminderWindowSpansNextDay } from '../src/lib/football/match-reminders.ts';

const kickoff = '2026-11-11T13:00:00.000Z';
const start = Date.parse(kickoff);
const match = (overrides = {}) => ({ id: 'eng.1:1', startTime: kickoff, status: 'scheduled', ...overrides });

test('reminder opt-in settings have safe defaults and strict lead choices', () => {
  assert.deepEqual(parseReminderSettings(null), DEFAULT_REMINDER_SETTINGS);
  assert.deepEqual(parseReminderSettings('{"enabled":true,"minutesBefore":60}'), { enabled: true, minutesBefore: 60 });
  assert.deepEqual(parseReminderSettings('{"enabled":true,"minutesBefore":45}'), DEFAULT_REMINDER_SETTINGS);
  assert.deepEqual(parseReminderSettings('{"enabled":"true","minutesBefore":30}'), DEFAULT_REMINDER_SETTINGS);
  assert.deepEqual(parseReminderSettings('bad json'), DEFAULT_REMINDER_SETTINGS);
});

test('only saved scheduled fixtures within the selected reminder window are due', () => {
  const rows = [match(), match({ id: 'eng.1:2', status: 'postponed' }), match({ id: 'eng.1:3' })];
  assert.deepEqual(dueMatchReminders(rows, ['eng.1:1', 'eng.1:2'], 30, start - 30 * 60_000), [rows[0]]);
  assert.deepEqual(dueMatchReminders(rows, ['eng.1:1'], 15, start - 20 * 60_000), []);
  assert.deepEqual(dueMatchReminders(rows, ['eng.1:1'], 60, start), []);
  assert.deepEqual(dueMatchReminders(rows, ['eng.1:1'], 60, start + 1_000), []);
  assert.deepEqual(dueMatchReminders([match(), match()], ['eng.1:1'], 30, start - 2 * 60_000).length, 1);
});

test('Vietnam midnight window includes next-day fixtures without announcing past kickoffs', () => {
  const beforeMidnight = Date.parse('2026-11-11T16:40:00.000Z'); // 23:40 GMT+7
  const justAfterMidnight = match({ id: 'eng.1:midnight', startTime: '2026-11-11T17:05:00.000Z' });
  assert.equal(reminderWindowSpansNextDay(beforeMidnight, 30), true);
  assert.equal(reminderWindowSpansNextDay(beforeMidnight, 15), false);
  assert.equal(reminderWindowSpansNextDay(Date.parse('2026-11-11T17:01:00.000Z'), 30), false);
  assert.equal(reminderWindowSpansNextDay(Number.NaN, 30), false);
  assert.deepEqual(dueMatchReminders([justAfterMidnight], [justAfterMidnight.id], 30, beforeMidnight), [justAfterMidnight]);
});

test('dedup persists by match and kickoff across tabs and resets for rescheduled games', () => {
  const data = new Map();
  const storage = { getItem(key) { return data.get(key) ?? null; }, setItem(key, value) { data.set(key, value); } };
  const when = start - 15 * 60_000;
  assert.equal(markReminderSent(storage, match(), 30, when), true);
  assert.equal(markReminderSent(storage, match(), 30, when), false);
  assert.equal(markReminderSent(storage, match({ startTime: '2026-11-11T14:00:00.000Z' }), 30, when), true);
  assert.equal(JSON.parse(data.get(REMINDER_SENT_KEY)).length, 2);
});

test('corrupt reminder history and blocked storage never crash the reminder engine', () => {
  const broken = { getItem() { return '{'; }, setItem() { throw new Error('blocked'); } };
  assert.equal(markReminderSent(broken, match(), 15, start - 1000), true);
  assert.deepEqual(dueMatchReminders([match({ startTime: 'invalid' })], ['eng.1:1'], 30, start - 1000), []);
});
