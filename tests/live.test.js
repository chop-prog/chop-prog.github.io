import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPOS, fetchLive, overall, relTime, ruPlural, summarize } from '../src/live.js';

const run = (over = {}) => ({
  name: 'CI', status: 'completed', conclusion: 'success', event: 'push',
  html_url: 'https://github.com/chop-prog/relay/actions/runs/1', updated_at: '2026-11-01T09:00:00Z',
  head_commit: { message: 'Fix the stream\n\nLonger body', timestamp: '2026-11-01T08:59:00Z' },
  ...over,
});

test('summarize: passing, failing, running and empty repos', () => {
  const ok = summarize('relay', { workflow_runs: [run()] });
  assert.deepEqual(ok, {
    repo: 'relay', state: 'pass', workflow: 'CI', event: 'push', message: 'Fix the stream',
    at: '2026-11-01T09:00:00Z', url: 'https://github.com/chop-prog/relay/actions/runs/1',
  });
  assert.equal(summarize('a', { workflow_runs: [run({ conclusion: 'failure' })] }).state, 'fail');
  assert.equal(summarize('a', { workflow_runs: [run({ conclusion: 'cancelled' })] }).state, 'fail');
  assert.equal(summarize('a', { workflow_runs: [run({ status: 'in_progress', conclusion: null })] }).state, 'running');
  assert.deepEqual(summarize('a', { workflow_runs: [] }), { repo: 'a', state: 'none' });
  assert.equal(summarize('a', { workflow_runs: [run({ head_commit: null })] }).message, '');
});

test('overall counts green builds and finds the latest push, ignoring repos without runs', () => {
  const o = overall([
    { state: 'pass', at: '2026-10-01T00:00:00Z' },
    { state: 'fail', at: '2026-10-30T00:00:00Z' },
    { state: 'none' },
  ]);
  assert.deepEqual(o, { ok: 1, total: 2, latest: '2026-10-30T00:00:00Z' });
  assert.deepEqual(overall([]), { ok: 0, total: 0, latest: null });
});

test('relative time in English and Russian', () => {
  const now = Date.parse('2026-11-01T12:00:00Z');
  const ago = (ms) => new Date(now - ms).toISOString();
  assert.equal(relTime(ago(20_000), now, 'en'), 'just now');
  assert.equal(relTime(ago(60_000), now, 'en'), '1 minute ago');
  assert.equal(relTime(ago(3 * 3600_000), now, 'en'), '3 hours ago');
  assert.equal(relTime(ago(21 * 60_000), now, 'ru'), '21 минуту назад');
  assert.equal(relTime(ago(3 * 3600_000), now, 'ru'), '3 часа назад');
  assert.equal(relTime(ago(5 * 86400_000), now, 'ru'), '5 дней назад');
  assert.equal(relTime(ago(11 * 86400_000), now, 'ru'), '11 дней назад');
});

test('ruPlural follows Russian number agreement', () => {
  const forms = [1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(ruPlural);
  assert.deepEqual(forms, [0, 1, 1, 2, 2, 2, 2, 0, 1, 2, 0, 2]);
});

test('fetchLive asks for the latest main-branch run of every repo and fails loudly on errors', async () => {
  const urls = [];
  const items = await fetchLive(async (url) => {
    urls.push(url);
    return { ok: true, json: async () => ({ workflow_runs: [run()] }) };
  });
  assert.equal(items.length, REPOS.length);
  assert.ok(urls.every((u) => u.startsWith('https://api.github.com/repos/chop-prog/') && u.endsWith('/actions/runs?per_page=1&branch=main')));
  await assert.rejects(fetchLive(async () => ({ ok: false, status: 403 })), /GitHub 403/);
});
