import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEspnStatus } from '../src/lib/football/espn-status.ts';

test('ESPN distinguishes postponed, cancelled and suspended games even when state suggests final or live', () => {
  for (const [name, state, expected, detail] of [
    ['STATUS_POSTPONED', 'post', 'postponed', 'Hoãn'],
    ['STATUS_CANCELED', 'pre', 'cancelled', 'Đã hủy'],
    ['STATUS_CANCELLED', 'post', 'cancelled', 'Đã hủy'],
    ['STATUS_SUSPENDED', 'in', 'interrupted', 'Gián đoạn'],
    ['STATUS_DELAYED', 'pre', 'interrupted', 'Gián đoạn'],
    ['STATUS_ABANDONED', 'post', 'interrupted', 'Gián đoạn'],
  ]) {
    assert.deepEqual(normalizeEspnStatus({ type: { name, state } }), { status: expected, detail }, name);
  }
});

test('ESPN preserves live clock and finished state for ordinary fixtures', () => {
  assert.deepEqual(normalizeEspnStatus({ type: { state: 'in', shortDetail: '1H' }, displayClock: "43:02" }),
    { status: 'live', detail: '43:02' });
  assert.deepEqual(normalizeEspnStatus({ type: { state: 'post', name: 'STATUS_FINAL' } }),
    { status: 'finished', detail: 'FT' });
  assert.deepEqual(normalizeEspnStatus({ type: { state: 'pre', name: 'STATUS_SCHEDULED' } }),
    { status: 'scheduled', detail: 'Sắp diễn ra' });
  assert.deepEqual(normalizeEspnStatus(undefined), { status: 'scheduled', detail: 'Sắp diễn ra' });
});

test('malformed optional ESPN status fields never crash live display or watch matching', () => {
  assert.deepEqual(normalizeEspnStatus({ type: { name: 13, state: 'in', shortDetail: 7 }, displayClock: null }),
    { status: 'live', detail: 'LIVE' });
  assert.deepEqual(normalizeEspnStatus({ type: { name: {}, state: [] } }),
    { status: 'scheduled', detail: 'Sắp diễn ra' });
});
