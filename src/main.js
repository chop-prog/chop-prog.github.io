import { STRINGS, detectLang } from './i18n.js';
import { initEffects, splitWords } from './effects.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Reveal animations only hide content once we know JS is running.
document.documentElement.classList.add('js');

// ── Language ──────────────────────────────────────────────────────────────────
function setLang(lang) {
  const dict = STRINGS[lang];
  document.documentElement.lang = lang;
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const text = dict[el.dataset.i18n];
    if (text) el.textContent = text;
  }
  for (const b of document.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
  try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
  splitWords(document.querySelector('.hero h1'));
}

let saved = null;
try { saved = localStorage.getItem('lang'); } catch { /* ignore */ }
setLang(detectLang(saved, navigator.languages || [navigator.language]));
for (const b of document.querySelectorAll('[data-lang]')) b.addEventListener('click', () => setLang(b.dataset.lang));

// ── Scroll reveal & counters ─────────────────────────────────────────────────
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('in');
    io.unobserve(e.target);
    for (const dt of e.target.querySelectorAll('[data-count]')) countUp(dt);
  }
}, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
document.querySelectorAll('.reveal').forEach((el, i) => {
  el.style.setProperty('--delay', `${Math.min(i, 4) * 70}ms`);
  io.observe(el);
});

function countUp(el) {
  const target = Number(el.dataset.count);
  if (reduced || target === 0) return;
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / 1200);
    el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// ── Pointer spotlight on project cards ───────────────────────────────────────
for (const card of document.querySelectorAll('.project, .mini, .skill-group')) {
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  });
}

// ── Header state ─────────────────────────────────────────────────────────────
const nav = document.querySelector('.nav');
const links = [...document.querySelectorAll('.nav nav a')];
const sections = links.map((a) => document.querySelector(a.getAttribute('href')));
addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', scrollY > 20);
  const y = scrollY + innerHeight * 0.35;
  let current = -1;
  sections.forEach((s, i) => { if (s && s.offsetTop <= y) current = i; });
  links.forEach((a, i) => a.classList.toggle('active', i === current));
}, { passive: true });

// ── Background flow field ────────────────────────────────────────────────────
// Particles drift along an analytic swirl field and leave soft trails; the pointer
// pushes them away. Rendered at half resolution and paused when the tab is hidden.
const canvas = document.getElementById('field');
const ctx = canvas.getContext('2d');
const SCALE = 0.5;
const COLORS = ['#7cf5d0', '#818cf8', '#f472b6'];
let W = 0;
let H = 0;
let parts = [];
const mouse = { x: -1e4, y: -1e4 };

function resize() {
  W = canvas.width = Math.ceil(innerWidth * SCALE);
  H = canvas.height = Math.ceil(innerHeight * SCALE);
  const n = Math.min(700, Math.round((W * H) / 450));
  parts = Array.from({ length: n }, () => spawn({}));
  ctx.fillStyle = '#07080d';
  ctx.fillRect(0, 0, W, H);
}

function spawn(p) {
  p.x = Math.random() * W;
  p.y = Math.random() * H;
  p.life = 100 + Math.random() * 300;
  p.c = COLORS[Math.floor(Math.random() * COLORS.length)];
  return p;
}

function field(x, y, t) {
  const s = 0.006;
  const a = Math.sin(x * s + t * 0.15) + Math.cos(y * s * 1.3 - t * 0.1) + Math.sin((x + y) * s * 0.7 + t * 0.05);
  return a * Math.PI;
}

let t = 0;
let running = true;
function frame() {
  if (!running) return;
  t += 0.016;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(7, 8, 13, 0.07)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 1;
  for (const p of parts) {
    const a = field(p.x, p.y, t);
    let vx = Math.cos(a) * 0.6;
    let vy = Math.sin(a) * 0.6;
    const dx = p.x - mouse.x;
    const dy = p.y - mouse.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < 6400) {
      const f = (1 - d2 / 6400) * 3;
      vx += (dx / Math.sqrt(d2 + 1)) * f;
      vy += (dy / Math.sqrt(d2 + 1)) * f;
    }
    ctx.strokeStyle = p.c;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    p.x += vx;
    p.y += vy;
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    if (--p.life <= 0 || p.x < 0 || p.y < 0 || p.x > W || p.y > H) spawn(p);
  }
  ctx.globalAlpha = 1;
  requestAnimationFrame(frame);
}

resize();
addEventListener('resize', resize);
const art = document.querySelector('.hero-art');
addEventListener('pointermove', (e) => {
  mouse.x = e.clientX * SCALE;
  mouse.y = e.clientY * SCALE;
  if (art && !reduced) {
    art.style.setProperty('--px', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
    art.style.setProperty('--py', ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
  }
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  running = !document.hidden && !reduced;
  if (running) requestAnimationFrame(frame);
});
if (reduced) {
  running = false;
  for (let i = 0; i < 120; i++) { running = true; frame(); running = false; }
} else {
  requestAnimationFrame(frame);
}

initEffects();
