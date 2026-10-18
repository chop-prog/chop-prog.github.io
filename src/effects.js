// Visual polish layer. Everything here is progressive enhancement: the page is complete
// without it, and it switches itself off for touch devices and prefers-reduced-motion.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Split a heading into word spans so they can animate in one by one. */
export function splitWords(el) {
  if (!el || reduced) return;
  const words = el.textContent.trim().split(/\s+/);
  el.setAttribute('aria-label', el.textContent.trim());
  el.classList.add('split');
  el.replaceChildren(
    ...words.flatMap((w, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.setAttribute('aria-hidden', 'true');
      span.style.setProperty('--i', String(i));
      span.textContent = w;
      return i < words.length - 1 ? [span, document.createTextNode(' ')] : [span];
    }),
  );
}

/** "Decrypt" a heading: random glyphs settle into the real text, left to right. */
const GLYPHS = '!<>-_\\/[]{}—=+*^?#01';
export function scramble(el, duration = 700) {
  if (reduced || el.dataset.scrambling) return;
  const target = el.textContent;
  el.dataset.scrambling = '1';
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const settled = Math.floor(t * target.length);
    let out = target.slice(0, settled);
    for (let i = settled; i < target.length; i++) {
      out += target[i] === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
    }
    el.textContent = out;
    if (t < 1) requestAnimationFrame(tick);
    else {
      el.textContent = target;
      delete el.dataset.scrambling;
    }
  };
  requestAnimationFrame(tick);
}

export function initEffects() {
  // Scroll progress bar (cheap: one transform per scroll frame).
  const bar = document.querySelector('.progress');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar?.style.setProperty('--p', String(max > 0 ? scrollY / max : 0));
      ticking = false;
    });
  };
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Section headings decrypt when they scroll into view.
  const headIo = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      scramble(e.target);
      headIo.unobserve(e.target);
    }
  }, { threshold: 0.6 });
  document.querySelectorAll('.section h2').forEach((h) => headIo.observe(h));

  if (reduced || !finePointer) return;
  document.documentElement.classList.add('fx');

  // Cursor spotlight that trails the pointer with easing.
  const glow = document.querySelector('.cursor-glow');
  let gx = innerWidth / 2;
  let gy = innerHeight / 3;
  let tx = gx;
  let ty = gy;
  addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
  }, { passive: true });
  const follow = () => {
    gx += (tx - gx) * 0.12;
    gy += (ty - gy) * 0.12;
    glow?.style.setProperty('transform', `translate3d(${gx}px, ${gy}px, 0)`);
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);

  // 3D tilt + moving glare on project screenshots.
  for (const shot of document.querySelectorAll('.shot')) {
    shot.addEventListener('pointermove', (e) => {
      const r = shot.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      shot.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
      shot.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
      shot.style.setProperty('--gx', `${x * 100}%`);
      shot.style.setProperty('--gy', `${y * 100}%`);
    });
    shot.addEventListener('pointerleave', () => {
      shot.style.setProperty('--rx', '0deg');
      shot.style.setProperty('--ry', '0deg');
    });
  }

  // Magnetic buttons: they lean toward the cursor a little.
  for (const btn of document.querySelectorAll('.btn')) {
    btn.addEventListener('pointermove', (e) => {
      const r = btn.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      btn.style.setProperty('--bx', `${dx * 0.2}px`);
      btn.style.setProperty('--by', `${dy * 0.3}px`);
    });
    btn.addEventListener('pointerleave', () => {
      btn.style.setProperty('--bx', '0px');
      btn.style.setProperty('--by', '0px');
    });
  }
}
