import test from 'node:test';
import assert from 'node:assert/strict';
import { settleLimited } from '../src/lib/football/settle-limited.ts';

test('upstream request pool caps concurrency while preserving outcomes in input order', async () => {
  let active = 0;
  let peak = 0;
  const tasks = Array.from({ length: 7 }, (_, index) => async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 4));
    active -= 1;
    if (index === 3) throw new Error('provider unavailable');
    return index;
  });
  const results = await settleLimited(tasks, 2);
  assert.equal(peak, 2);
  assert.deepEqual(results.map((value) => value.status), [
    'fulfilled', 'fulfilled', 'fulfilled', 'rejected', 'fulfilled', 'fulfilled', 'fulfilled',
  ]);
  assert.equal(results[0].value, 0);
  assert.equal(results[6].value, 6);
  assert.match(results[3].reason.message, /provider unavailable/);
});

test('empty pool returns an empty result and rejects invalid concurrency', async () => {
  assert.deepEqual(await settleLimited([], 2), []);
  await assert.rejects(settleLimited([], 0), /positive integer/);
});
