import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRecentForm } from '../src/lib/football/recent-form.ts';

test('ESPN recorded form is parsed without changing the win/draw/loss order', () => {
  assert.deepEqual(parseRecentForm('WDLWW'), ['W', 'D', 'L', 'W', 'W']);
  assert.deepEqual(parseRecentForm('w, d - l / w'), ['W', 'D', 'L', 'W']);
});

test('missing, malformed and longer-than-five form never becomes invented results', () => {
  for (const input of [null, undefined, 123, '', 'WWWXW', 'WWWWWW', '<script>', 'W:D']) {
    assert.deepEqual(parseRecentForm(input), []);
  }
});
