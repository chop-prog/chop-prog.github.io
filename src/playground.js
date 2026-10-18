// Interactive particle typography: type anything and ~16k particles assemble into it.
// Physics lives in swarm.js; this file handles layout, input and rendering (WebGL2, with a
// Canvas 2D fallback). The loop only runs while the panel is on screen and the tab is visible.
import { addWave, createSwarm, fitFontSize, sampleMask, setTargets, snap, step } from './swarm.js';

const DEFAULT = 'chop-prog';
const BG = [10 / 255, 11 / 255, 18 / 255];
const BG_CSS = '#0a0b12';
const COLORS = ['#7cf5d0', '#818cf8', '#f472b6'];
const AUTOPLAY_EVERY = 4.5; // s between preset shapes until the visitor interacts

const VS = `#version 300 es
in vec4 a; // x, y (CSS px), speed (px/s), seed (+2 for dust)
uniform vec2 uRes;
uniform float uDpr;
uniform float uGain; // without trails nothing accumulates, so each particle draws brighter
out vec3 vColor;
out float vAlpha;
const vec3 MINT = vec3(0.486, 0.961, 0.816);
const vec3 INDIGO = vec3(0.506, 0.549, 0.973);
const vec3 PINK = vec3(0.957, 0.447, 0.714);
void main() {
  float dust = step(1.5, a.w);
  float seed = fract(a.w);
  vec2 clip = a.xy / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float u = clamp(a.x / uRes.x + (seed - 0.5) * 0.18, 0.0, 1.0);
  vec3 base = u < 0.5 ? mix(MINT, INDIGO, u * 2.0) : mix(INDIGO, PINK, u * 2.0 - 1.0);
  float heat = clamp(a.z / 900.0, 0.0, 1.0); // fast particles glow white-hot
  vColor = mix(base, vec3(1.0), heat * 0.75);
  vAlpha = (mix(0.3, 0.16, dust) * (0.65 + 0.35 * seed) + heat * 0.25) * uGain;
  gl_PointSize = (mix(2.0, 1.5, dust) + seed * 1.3 + heat * 1.6) * uDpr;
}`;

const FS = `#version 300 es
precision mediump float;
in vec3 vColor;
in float vAlpha;
out vec4 o;
void main() {
  float a = smoothstep(0.5, 0.1, length(gl_PointCoord - 0.5)) * vAlpha;
  o = vec4(vColor * a, 1.0); // additive blending: overlapping particles bloom
}`;

// Full-screen triangle that fades the previous frame towards the background: motion trails.
const FADE_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FADE_FS = `#version 300 es
precision mediump float;
uniform vec4 uFade;
out vec4 o;
void main() { o = uFade; }`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? 'shader');
  return sh;
}

function link(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link');
  return p;
}

function glRenderer(canvas, trails) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  const prog = link(gl, VS, FS);
  const fade = link(gl, FADE_VS, FADE_FS);
  const uRes = gl.getUniformLocation(prog, 'uRes');
  const uDpr = gl.getUniformLocation(prog, 'uDpr');
  const uGain = gl.getUniformLocation(prog, 'uGain');
  const uFade = gl.getUniformLocation(fade, 'uFade');
  const vao = gl.createVertexArray();
  const empty = gl.createVertexArray();
  const buf = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  let w = 1;
  let h = 1;
  let dpr = 1;
  let size = 0;
  return {
    kind: 'WebGL2',
    resize(W, H, D) {
      [w, h, dpr] = [W, H, D];
      canvas.width = Math.round(W * D);
      canvas.height = Math.round(H * D);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(BG[0], BG[1], BG[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    },
    draw(s) {
      gl.useProgram(fade);
      gl.bindVertexArray(empty);
      gl.uniform4f(uFade, BG[0], BG[1], BG[2], trails ? 0.3 : 1);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      if (s.buf.length !== size) {
        gl.bufferData(gl.ARRAY_BUFFER, s.buf, gl.DYNAMIC_DRAW);
        size = s.buf.length;
      } else {
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, s.buf);
      }
      gl.uniform2f(uRes, w, h);
      gl.uniform1f(uDpr, dpr);
      gl.uniform1f(uGain, trails ? 1 : 2.6);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, s.n); // the whole swarm in one draw call
    },
  };
}

function canvasRenderer(canvas, trails) {
  const ctx = canvas.getContext('2d');
  let w = 1;
  let h = 1;
  return {
    kind: 'Canvas 2D',
    resize(W, H, D) {
      [w, h] = [W, H];
      canvas.width = Math.round(W * D);
      canvas.height = Math.round(H * D);
      ctx.setTransform(D, 0, 0, D, 0, 0);
      ctx.fillStyle = BG_CSS;
      ctx.fillRect(0, 0, W, H);
    },
    draw(s) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = trails ? 0.3 : 1;
      ctx.fillStyle = BG_CSS;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = trails ? 0.45 : 0.9;
      COLORS.forEach((c, band) => {
        ctx.fillStyle = c;
        for (let i = 0; i < s.n; i++) {
          const x = s.buf[i * 4];
          if (Math.min(2, Math.max(0, Math.floor((x / w) * 3))) === band) ctx.fillRect(x - 1, s.buf[i * 4 + 1] - 1, 2, 2);
        }
      });
      ctx.globalAlpha = 1;
    },
  };
}

function drawHeart(ctx, cx, cy, size) {
  ctx.beginPath();
  for (let i = 0; i <= 160; i++) {
    const t = (i / 160) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    ctx.lineTo(cx + (x / 34) * size, cy + ((y - 2.5) / 34) * size);
  }
  ctx.fill();
}

export function initPlayground(root, { reduced = false } = {}) {
  const stage = root.querySelector('.pg');
  let canvas = root.querySelector('canvas');
  const input = root.querySelector('.pg-input');
  const chips = [...root.querySelectorAll('.pg-chip')];
  const top = root.querySelector('.pg-top');
  const bottom = root.querySelector('.pg-bottom');
  const hud = { n: root.querySelector('.pg-n'), fps: root.querySelector('.pg-fps'), ms: root.querySelector('.pg-ms'), kind: root.querySelector('.pg-kind') };

  let renderer = null;
  try {
    renderer = glRenderer(canvas, !reduced);
  } catch (err) {
    console.warn('playground: WebGL2 failed, falling back to Canvas 2D', err);
    const fresh = canvas.cloneNode(); // a canvas that already has a WebGL context can't give a 2D one
    canvas.replaceWith(fresh);
    canvas = fresh;
  }
  renderer ??= canvasRenderer(canvas, !reduced);
  hud.kind.textContent = renderer.kind;

  const mask = document.createElement('canvas');
  const mctx = mask.getContext('2d', { willReadFrequently: true });
  let swarm = null;
  let w = 0;
  let h = 0;
  let shape = DEFAULT;

  function box() {
    const r = stage.getBoundingClientRect();
    return {
      x0: w * 0.05,
      x1: w * 0.95,
      y0: top.getBoundingClientRect().bottom - r.top + 8,
      y1: bottom.getBoundingClientRect().top - r.top - 8,
    };
  }

  function rasterise(text) {
    mask.width = w;
    mask.height = h;
    const b = box();
    const bw = b.x1 - b.x0;
    const bh = Math.max(20, b.y1 - b.y0);
    const cx = (b.x0 + b.x1) / 2;
    const cy = b.y0 + bh / 2;
    mctx.fillStyle = '#fff';
    if (text === '♥') {
      drawHeart(mctx, cx, cy, Math.min(bw, bh) * 1.05);
    } else {
      const font = (px) => `700 ${px}px Inter, system-ui, sans-serif`;
      const size = fitFontSize((px) => ((mctx.font = font(px)), mctx.measureText(text).width), bw, bh, 0.72);
      mctx.font = font(size);
      mctx.textAlign = 'center';
      mctx.textBaseline = 'alphabetic';
      const m = mctx.measureText(text);
      mctx.fillText(text, cx, cy + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
    }
    return sampleMask(mctx.getImageData(0, 0, w, h).data, w, h);
  }

  function setShape(text) {
    shape = text;
    if (!swarm) return;
    setTargets(swarm, rasterise(text));
    for (const c of chips) c.setAttribute('aria-pressed', String(c.textContent.trim() === text));
    if (reduced) {
      snap(swarm);
      renderer.draw(swarm);
    }
  }

  function layout() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    w = Math.round(r.width);
    h = Math.round(r.height);
    renderer.resize(w, h, Math.min(devicePixelRatio || 1, 2));
    if (!swarm) {
      const cap = renderer.kind === 'WebGL2' ? 16000 : 5000; // 2D fallback draws rects one by one
      swarm = createSwarm(Math.round(Math.min(cap, Math.max(3000, (w * h) / 30))), w, h);
      hud.n.textContent = swarm.n.toLocaleString('en-US');
    }
    swarm.w = w;
    swarm.h = h;
    if (assembled) setShape(shape);
    else renderer.draw(swarm);
  }

  // ── Loop ──────────────────────────────────────────────────────────────────
  const pointer = { x: 0, y: 0, vx: 0, vy: 0, time: 0, inside: false };
  let running = false;
  let visible = false;
  let assembled = false;
  let touched = false;
  let last = 0;
  let t = 0;
  let lastSwitch = 0;
  let frames = 0;
  let simMs = 0;
  let statsAt = 0;

  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    t += dt;
    const t0 = performance.now();
    step(swarm, dt, t, pointer.inside ? pointer : null);
    renderer.draw(swarm);
    simMs += performance.now() - t0;
    pointer.vx *= 0.85; // a resting cursor stops dragging particles along
    pointer.vy *= 0.85;
    frames++;
    if (now - statsAt > 500) {
      hud.fps.textContent = String(Math.round((frames * 1000) / (now - statsAt)));
      hud.ms.textContent = (simMs / frames).toFixed(2);
      frames = 0;
      simMs = 0;
      statsAt = now;
    }
    if (!touched && t - lastSwitch > AUTOPLAY_EVERY) nextPreset();
    requestAnimationFrame(frame);
  }

  function nextPreset() {
    const presets = chips.map((c) => c.textContent.trim());
    setShape(presets[(presets.indexOf(shape) + 1) % presets.length]);
    lastSwitch = t;
  }

  function update() {
    const should = visible && !document.hidden && !reduced && swarm !== null;
    if (should && !running) {
      running = true;
      last = statsAt = performance.now();
      requestAnimationFrame(frame);
    } else if (!should) {
      running = false;
    }
  }

  function assemble() {
    if (assembled || !swarm) return;
    assembled = true;
    lastSwitch = t;
    setShape(shape);
  }

  // ── Input ─────────────────────────────────────────────────────────────────
  const interacted = () => (touched = true);
  const local = (e) => {
    const r = stage.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  stage.addEventListener('pointermove', (e) => {
    const [x, y] = local(e);
    const now = performance.now();
    if (pointer.inside && pointer.time) {
      const dtp = Math.max(8, now - pointer.time) / 1000;
      pointer.vx = pointer.vx * 0.5 + ((x - pointer.x) / dtp) * 0.5;
      pointer.vy = pointer.vy * 0.5 + ((y - pointer.y) / dtp) * 0.5;
    }
    Object.assign(pointer, { x, y, time: now, inside: true });
    interacted();
  });
  stage.addEventListener('pointerleave', () => Object.assign(pointer, { inside: false, vx: 0, vy: 0, time: 0 }));
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('input, button') || !swarm || reduced) return;
    const [x, y] = local(e);
    addWave(swarm, x, y, t);
    interacted();
  });

  let typing = 0;
  input.addEventListener('input', () => {
    interacted();
    clearTimeout(typing);
    typing = setTimeout(() => setShape(input.value.trim() || DEFAULT), 120);
  });
  for (const c of chips) {
    c.addEventListener('click', () => {
      interacted();
      input.value = '';
      setShape(c.textContent.trim());
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  const fontReady = Promise.race([
    document.fonts?.load('700 100px Inter') ?? Promise.resolve(),
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => {});

  new ResizeObserver(() => layout()).observe(stage);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) fontReady.then(assemble);
    update();
  }, { threshold: 0.25 }).observe(stage);
  document.addEventListener('visibilitychange', update);
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    visible = false;
  });
  layout();
}
