import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, addWave, createSwarm, fitFontSize, mulberry32, sampleMask, setTargets, snap, step } from '../src/swarm.js';

/** A w×h RGBA buffer with a filled rectangle. */
function rectMask(w, h, [x0, y0, x1, y1]) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) data[(y * w + x) * 4 + 3] = 255;
  return data;
}

const run = (s, seconds, pointer = null, o = DEFAULTS, t0 = 0) => {
  let t = t0;
  for (let i = 0; i < seconds * 60; i++) step(s, 1 / 60, (t += 1 / 60), pointer, o);
  return t;
};

test('sampleMask returns exactly the lit pixels, honouring the stride', () => {
  const data = rectMask(10, 8, [2, 3, 5, 5]);
  const all = sampleMask(data, 10, 8);
  assert.equal(all.length / 2, 3 * 2);
  assert.deepEqual([...all.slice(0, 4)], [2, 3, 3, 3]);
  assert.equal(sampleMask(data, 10, 8, 2).length / 2, 2); // x ∈ {2, 4}, y = 4
  assert.equal(sampleMask(new Uint8ClampedArray(10 * 8 * 4), 10, 8).length, 0);
});

test('fitFontSize fills the height for short text and shrinks long text to the width', () => {
  const measure = (chars) => (px) => chars * px * 0.6;
  assert.equal(fitFontSize(measure(2), 1000, 300, 0.7), 210);
  const long = fitFontSize(measure(20), 600, 300, 0.7);
  assert.ok(Math.abs(measure(20)(long) - 600) < 1e-6);
});

test('setTargets puts shape particles inside lit pixels and the rest on the panel as dust', () => {
  const rand = mulberry32(1);
  const s = createSwarm(2000, 200, 100, rand);
  const pts = sampleMask(rectMask(200, 100, [50, 40, 150, 60]), 200, 100); // 2000 lit pixels
  const count = setTargets(s, pts, rand);
  assert.equal(count, 1200); // 0.6 per lit pixel
  let shape = 0;
  for (let i = 0; i < s.n; i++) {
    if (s.dust[i]) {
      assert.ok(s.tx[i] >= 0 && s.tx[i] <= 200 && s.ty[i] >= 0 && s.ty[i] <= 100);
    } else {
      shape++;
      assert.ok(s.tx[i] >= 50 && s.tx[i] < 151 && s.ty[i] >= 40 && s.ty[i] < 61, `particle ${i} off the shape`);
    }
  }
  assert.equal(shape, count);
});

test('setTargets always keeps some dust, and an empty shape makes everything dust', () => {
  const rand = mulberry32(2);
  const s = createSwarm(500, 100, 100, rand);
  const big = sampleMask(rectMask(100, 100, [0, 0, 100, 100]), 100, 100);
  assert.equal(setTargets(s, big, rand), 460); // capped at 92 %
  assert.equal(setTargets(s, new Float32Array(0), rand), 0);
  assert.ok(s.dust.every((d) => d === 1));
});

test('without a pointer, shape particles settle on their targets', () => {
  const rand = mulberry32(3);
  const s = createSwarm(800, 400, 200, rand);
  setTargets(s, sampleMask(rectMask(400, 200, [100, 80, 300, 120]), 400, 200), rand);
  run(s, 4, null, { ...DEFAULTS, drift: 0 });
  let worst = 0;
  for (let i = 0; i < s.n; i++) if (!s.dust[i]) worst = Math.max(worst, Math.hypot(s.x[i] - s.tx[i], s.y[i] - s.ty[i]));
  assert.ok(worst < 0.5, `worst distance ${worst}`);
});

test('the pointer clears a hole in the shape and the shape heals after it leaves', () => {
  const rand = mulberry32(4);
  const s = createSwarm(1500, 400, 200, rand);
  setTargets(s, sampleMask(rectMask(400, 200, [100, 50, 300, 150]), 400, 200), rand);
  const o = { ...DEFAULTS, drift: 0 };
  let t = run(s, 3, null, o);
  const near = () => {
    let c = 0;
    for (let i = 0; i < s.n; i++) if (!s.dust[i] && Math.hypot(s.x[i] - 200, s.y[i] - 100) < 25) c++;
    return c;
  };
  const before = near();
  assert.ok(before > 10);
  t = run(s, 1, { x: 200, y: 100, vx: 0, vy: 0 }, o, t);
  assert.equal(near(), 0, 'nothing stays right under the cursor');
  run(s, 3, null, o, t);
  assert.equal(near(), before);
});

test('a shockwave pushes particles outward, then expires', () => {
  const rand = mulberry32(5);
  const s = createSwarm(1000, 400, 400, rand);
  setTargets(s, sampleMask(rectMask(400, 400, [100, 100, 300, 300]), 400, 400), rand);
  const o = { ...DEFAULTS, drift: 0 };
  let t = run(s, 3, null, o);
  const spread = () => {
    let sum = 0;
    for (let i = 0; i < s.n; i++) sum += Math.hypot(s.x[i] - 200, s.y[i] - 200);
    return sum / s.n;
  };
  const before = spread();
  addWave(s, 200, 200, t);
  t = run(s, 0.15, null, o, t);
  assert.ok(spread() > before + 3, 'particles moved outward');
  run(s, 2, null, o, t);
  assert.equal(s.waves.length, 0);
});

test('large or negative time steps are clamped and never produce NaN', () => {
  const rand = mulberry32(6);
  const s = createSwarm(300, 200, 200, rand);
  setTargets(s, sampleMask(rectMask(200, 200, [50, 50, 150, 150]), 200, 200), rand);
  step(s, 5, 1, { x: 100, y: 100, vx: 5000, vy: -5000 });
  step(s, -1, 2, null);
  for (const v of s.buf) assert.ok(Number.isFinite(v));
  for (let i = 0; i < s.n; i++) assert.ok(Math.abs(s.x[i]) < 1e4 && Math.abs(s.y[i]) < 1e4);
});

test('snap and pack: positions on targets, dust flagged for the shader', () => {
  const rand = mulberry32(7);
  const s = createSwarm(100, 100, 100, rand);
  setTargets(s, sampleMask(rectMask(100, 100, [40, 40, 60, 60]), 100, 100), rand);
  snap(s);
  for (let i = 0; i < s.n; i++) {
    assert.equal(s.buf[i * 4], s.tx[i]);
    assert.equal(s.buf[i * 4 + 2], 0);
    assert.equal(s.buf[i * 4 + 3] >= 2, s.dust[i] === 1);
  }
});

test('same seed, same swarm', () => {
  const make = () => {
    const rand = mulberry32(42);
    const s = createSwarm(200, 100, 100, rand);
    setTargets(s, sampleMask(rectMask(100, 100, [20, 20, 80, 80]), 100, 100), rand);
    run(s, 0.5, { x: 50, y: 50, vx: 100, vy: 0 });
    return [...s.buf];
  };
  assert.deepEqual(make(), make());
});
