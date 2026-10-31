import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rank, score } from '../src/palette.js';
import { makeTypeWatcher } from '../src/delight.js';

const cmds = [
  { label: 'Нанять chop-prog', keywords: 'нанять работа hire job' },
  { label: 'Проекты' },
  { label: 'Лаборатория' },
  { label: 'Relay', keywords: 'TypeScript · Hono · SQLite · SSE' },
  { label: 'Странные аттракторы', keywords: 'Canvas 2D · RK4' },
];

test('empty query keeps the original order', () => {
  assert.deepEqual(rank('', cmds).map((c) => c.label), cmds.map((c) => c.label));
});

test('substring beats subsequence, and word starts beat the middle of a word', () => {
  assert.ok(score('лаб', 'Лаборатория') > score('лбр', 'Лаборатория'));
  assert.ok(score('про', 'Проекты') > score('про', 'Опрос'));
  assert.equal(score('xyz', 'Relay'), -1);
});

test('keywords find a command its label does not mention', () => {
  assert.equal(rank('hire', cmds)[0].label, 'Нанять chop-prog');
  assert.equal(rank('sqlite', cmds)[0].label, 'Relay');
  assert.equal(rank('rk4', cmds)[0].label, 'Странные аттракторы');
});

test('fuzzy matching is case-insensitive and treats ё as е', () => {
  assert.ok(score('ЛАБ', 'лаборатория') > 0);
  assert.ok(score('ещё', 'Еще проекты') > 0);
  assert.deepEqual(rank('стрн', cmds).map((c) => c.label), ['Странные аттракторы']);
});

test('a label match outranks a keyword match', () => {
  assert.equal(rank('атр', cmds)[0].label, 'Странные аттракторы');
});

test('the type watcher fires on the trigger word only, in either language', () => {
  const watch = makeTypeWatcher(['hire', 'нанять']);
  const typed = (s) => [...s].map(watch).filter(Boolean);
  assert.deepEqual(typed('hello'), []);
  assert.deepEqual(typed('we should HIRE'), ['hire']);
  assert.deepEqual(typed('нанять'), ['нанять']);
  assert.equal(watch('Shift'), null);
});
