import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const cards = [...html.matchAll(/<a class="lab-card" href="lab\/([^/"]+)\/"[\s\S]*?<img src="([^"]+)"/g)];

test('the lab section links four demos', () => {
  assert.equal(cards.length, 4);
});

test('every lab demo exists, loads the shared script and has English text', () => {
  for (const [, slug, img] of cards) {
    const page = new URL(`lab/${slug}/index.html`, root);
    assert.ok(existsSync(page), `missing lab/${slug}/index.html`);
    assert.ok(existsSync(new URL(img, root)), `missing preview ${img}`);
    const src = readFileSync(page, 'utf8');
    assert.match(src, /<script src="\.\.\/lab\.js"><\/script>/, `${slug} doesn't load lab.js`);
    assert.match(src, /<body data-title-en="[^"]+">/, `${slug} has no English title`);
    assert.match(src, /<h1[^>]*data-en="[^"]+"|<span id="name" data-en="[^"]+"/, `${slug} heading isn't translated`);
    // Russian strings used at runtime go through LAB.t(ru, en).
    assert.ok(!/\bn:'[А-Яа-яЁё]/.test(src) && !/shape\('[А-Яа-яЁё]/.test(src), `${slug} has an untranslated name`);
  }
});
