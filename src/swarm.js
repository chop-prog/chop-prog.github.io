// Particle swarm for the playground: pure functions over typed arrays, so the physics can be
// tested in Node and rendered by WebGL2 (or Canvas 2D) in the browser.
//
// Every particle is a damped spring pulled towards a target point. Targets come from lit
// pixels of a shape (text drawn to an offscreen canvas); particles that don't fit the shape
// become slow-drifting dust. The pointer pushes particles away and drags them along its
// motion, and clicks launch expanding shockwave rings.

export const DEFAULTS = {
  stiffness: 40, // spring constant, 1/s²
  damping: 7, // velocity decay rate, 1/s
  radius: 100, // pointer influence radius, px
  push: 5200, // pointer repulsion, px/s²
  drag: 7, // how strongly pointer motion drags particles along, 1/s
  waveSpeed: 750, // shockwave ring speed, px/s
  waveWidth: 55, // ring thickness, px
  waveForce: 26000, // ring push, px/s²
  waveLife: 1.3, // s
  drift: 1, // idle motion amplitude multiplier (0 = perfectly still)
};

/** Small seeded PRNG (mulberry32) for reproducible layouts and tests. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSwarm(n, w, h, rand = Math.random) {
  const s = {
    n,
    w,
    h,
    x: new Float32Array(n),
    y: new Float32Array(n),
    vx: new Float32Array(n),
    vy: new Float32Array(n),
    tx: new Float32Array(n),
    ty: new Float32Array(n),
    k: new Float32Array(n), // per-particle stiffness factor, so the swarm moves organically
    seed: new Float32Array(n),
    dust: new Uint8Array(n),
    buf: new Float32Array(n * 4), // packed for the GPU: x, y, speed, seed (+2 for dust)
    waves: [],
    shapeCount: 0,
  };
  for (let i = 0; i < n; i++) {
    s.x[i] = s.tx[i] = rand() * w;
    s.y[i] = s.ty[i] = rand() * h;
    s.seed[i] = rand();
    s.k[i] = 0.6 + 0.8 * rand();
    s.dust[i] = 1;
  }
  pack(s);
  return s;
}

/** Coordinates of pixels whose alpha reaches `threshold`, scanning every `step` pixels: [x0, y0, x1, y1, …]. */
export function sampleMask(data, w, h, step = 1, threshold = 128) {
  const out = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] >= threshold) out.push(x, y);
  }
  return Float32Array.from(out);
}

/** Largest font size that fits one line into the box. `measure(px)` returns the text width at that size. */
export function fitFontSize(measure, boxW, boxH, maxRatio = 0.7) {
  let size = boxH * maxRatio;
  const width = measure(size);
  if (width > boxW) size *= boxW / width;
  return Math.max(6, size);
}

/**
 * Retarget the swarm at a new shape. Up to `perPixel` particles per lit pixel join the shape
 * (a random subset of pixels, jittered inside each pixel so no grid shows); the rest become
 * dust scattered over the panel. At least `minDust` of the swarm always stays dust. Particles
 * are assigned in random order, so a morph sends each one on its own path.
 */
export function setTargets(s, points, rand = Math.random, { perPixel = 0.6, minDust = 0.08 } = {}) {
  const m = points.length >> 1;
  const count = Math.min(Math.floor(s.n * (1 - minDust)), Math.floor(m * perPixel));
  const order = permutation(s.n, s.n, rand);
  const pick = permutation(m, count, rand);
  for (let j = 0; j < s.n; j++) {
    const i = order[j];
    if (j < count) {
      const p = pick[j];
      s.tx[i] = points[2 * p] + rand();
      s.ty[i] = points[2 * p + 1] + rand();
      s.dust[i] = 0;
    } else {
      s.tx[i] = rand() * s.w;
      s.ty[i] = rand() * s.h;
      s.dust[i] = 1;
    }
  }
  s.shapeCount = count;
  return count;
}

/** Indices 0..n-1 with the first `k` entries a uniform random sample (partial Fisher–Yates). */
function permutation(n, k, rand) {
  const a = new Uint32Array(n);
  for (let i = 0; i < n; i++) a[i] = i;
  for (let i = 0; i < Math.min(k, n - 1); i++) {
    const j = i + Math.floor(rand() * (n - i));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

export function addWave(s, x, y, t) {
  s.waves.push({ x, y, t });
  if (s.waves.length > 4) s.waves.shift();
}

/**
 * Advance the simulation by `dt` seconds (clamped to 1/30 so a dropped frame can't blow it up).
 * `t` is the simulation clock; `pointer` is { x, y, vx, vy } in px and px/s, or null.
 */
export function step(s, dt, t, pointer = null, o = DEFAULTS) {
  dt = Math.min(Math.max(dt, 0), 1 / 30);
  const { n, x, y, vx, vy, tx, ty, k, seed, dust } = s;
  const damp = Math.exp(-o.damping * dt);
  const px = pointer ? pointer.x : 1e9;
  const py = pointer ? pointer.y : 1e9;
  const pvx = pointer ? pointer.vx : 0;
  const pvy = pointer ? pointer.vy : 0;
  const r2 = o.radius * o.radius;
  const waves = (s.waves = s.waves.filter((w) => t - w.t < o.waveLife));
  const nw = waves.length;

  for (let i = 0; i < n; i++) {
    const isDust = dust[i] === 1;
    // Targets breathe a little so the shape looks alive; dust wanders in slow loops.
    const amp = (isDust ? 18 : 0.9) * o.drift;
    const ph = t * (isDust ? 0.35 : 1.1) + seed[i] * 62.8;
    const kk = o.stiffness * k[i] * (isDust ? 0.12 : 1);
    let ax = (tx[i] + Math.sin(ph) * amp - x[i]) * kk;
    let ay = (ty[i] + Math.cos(ph * 1.3) * amp - y[i]) * kk;

    const dx = x[i] - px;
    const dy = y[i] - py;
    const d2 = dx * dx + dy * dy;
    if (d2 < r2) {
      const d = Math.sqrt(d2) + 1e-3;
      let f = 1 - d / o.radius;
      f *= f;
      ax += (dx / d) * f * o.push + pvx * f * o.drag;
      ay += (dy / d) * f * o.push + pvy * f * o.drag;
    }

    for (let j = 0; j < nw; j++) {
      const w = waves[j];
      const wx = x[i] - w.x;
      const wy = y[i] - w.y;
      const d = Math.sqrt(wx * wx + wy * wy) + 1e-3;
      const age = t - w.t;
      const off = Math.abs(d - age * o.waveSpeed);
      if (off < o.waveWidth) {
        const f = (1 - off / o.waveWidth) * (1 - age / o.waveLife) * o.waveForce;
        ax += (wx / d) * f;
        ay += (wy / d) * f;
      }
    }

    // Semi-implicit Euler with exponential damping: stable for any dt up to the clamp.
    const nvx = (vx[i] + ax * dt) * damp;
    const nvy = (vy[i] + ay * dt) * damp;
    vx[i] = nvx;
    vy[i] = nvy;
    x[i] += nvx * dt;
    y[i] += nvy * dt;
  }
  pack(s);
}

/** Put every particle exactly on its target (used under prefers-reduced-motion). */
export function snap(s) {
  s.x.set(s.tx);
  s.y.set(s.ty);
  s.vx.fill(0);
  s.vy.fill(0);
  pack(s);
}

export function pack(s) {
  const { n, x, y, vx, vy, seed, dust, buf } = s;
  for (let i = 0, o = 0; i < n; i++, o += 4) {
    buf[o] = x[i];
    buf[o + 1] = y[i];
    buf[o + 2] = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i]);
    buf[o + 3] = seed[i] + (dust[i] ? 2 : 0);
  }
}
