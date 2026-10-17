import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRINGS, LANGS, detectLang } from '../src/i18n.js';

test('every language has exactly the same keys', () => {
  const [base, ...rest] = LANGS;
  const keys = Object.keys(STRINGS[base]).sort();
  for (const lang of rest) assert.deepEqual(Object.keys(STRINGS[lang]).sort(), keys, `${lang} is out of sync`);
});

test('no empty translations', () => {
  for (const lang of LANGS) for (const [k, v] of Object.entries(STRINGS[lang])) assert.ok(v.trim(), `${lang}.${k} is empty`);
});

test('every data-i18n key used in the HTML exists, and the HTML ships the English text', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const used = [...html.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)];
  assert.ok(used.length > 20);
  for (const [, key, text] of used) {
    assert.ok(key in STRINGS.en, `missing key ${key}`);
    const decoded = text.replace(/&amp;/g, '&').trim();
    assert.equal(decoded, STRINGS.en[key], `HTML text for ${key} differs from the dictionary`);
  }
});

test('language detection: saved choice wins, then browser languages', () => {
  assert.equal(detectLang('en', ['ru-RU']), 'en');
  assert.equal(detectLang(null, ['ru-RU', 'en']), 'ru');
  assert.equal(detectLang(null, ['uk']), 'ru');
  assert.equal(detectLang('xx', ['de-DE']), 'en');
  assert.equal(detectLang(null, []), 'en');
});
