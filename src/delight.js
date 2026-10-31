// Small touches: toasts, a burst of green checkmarks, copying the Telegram handle, a note
// for whoever opens DevTools, a tab title for when the visitor looks away, and the
// "type hire anywhere" shortcut. None of it is needed to use the page.

const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const HANDLE = '@chunua4';

const TEXT = {
  en: {
    copied: `Copied ${HANDLE}. Your move.`,
    copyFail: `Telegram: ${HANDLE}`,
    hired: 'Good call. Contacts are below, the tests are green.',
    away: 'Tests are still green · chop-prog',
  },
  ru: {
    copied: `Скопировано: ${HANDLE}. Дальше ваш ход.`,
    copyFail: `Telegram: ${HANDLE}`,
    hired: 'Хорошее решение. Контакты ниже, тесты зелёные.',
    away: 'Тесты всё ещё зелёные · chop-prog',
  },
};
const tr = () => TEXT[document.documentElement.lang] ?? TEXT.en;

/** Keeps the last few typed characters and reports when they end with a trigger word. */
export function makeTypeWatcher(words, size = 12) {
  let buf = '';
  return (key) => {
    if (key.length !== 1) return null;
    buf = (buf + key.toLowerCase()).slice(-size);
    return words.find((w) => buf.endsWith(w)) ?? null;
  };
}

let toastEl = null;
let toastTimer = 0;
export function toast(text) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  toastEl.textContent = text;
  toastEl.classList.remove('show');
  void toastEl.offsetWidth; // restart the transition
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 3200);
}

/** Green checkmarks fly out of a point, like a CI run that went well. */
export function burst(x, y, n = 22) {
  if (reduced) return;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'check';
    s.textContent = '✓';
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const d = 70 + Math.random() * 110;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * d - 40}px`);
    s.style.setProperty('--r', `${(Math.random() - 0.5) * 120}deg`);
    s.style.fontSize = `${12 + Math.random() * 12}px`;
    s.addEventListener('animationend', () => s.remove());
    document.body.append(s);
  }
}

function center(el) {
  const r = el.getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}

export async function copyHandle(from) {
  try {
    await navigator.clipboard.writeText(HANDLE);
    toast(tr().copied);
    if (from) burst(...center(from), 14);
  } catch {
    toast(tr().copyFail);
  }
}

export function hire() {
  const contact = document.getElementById('contact');
  if (!contact) return;
  contact.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  const facts = contact.querySelector('.facts') ?? contact;
  setTimeout(() => {
    facts.classList.remove('flash');
    void facts.offsetWidth;
    facts.classList.add('flash');
    burst(...center(facts));
    toast(tr().hired);
  }, reduced ? 0 : 650);
}

export function initDelight() {
  for (const b of document.querySelectorAll('[data-copy]')) b.addEventListener('click', () => copyHandle(b));

  const watch = makeTypeWatcher(['hire', 'нанять']);
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.querySelector('dialog[open]')) return;
    if (watch(e.key)) hire();
  });

  let title = document.title;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      title = document.title;
      document.title = tr().away;
    } else {
      document.title = title;
    }
  });

  // Steps of the case study light up one after another as they scroll in.
  const steps = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('lit'); steps.unobserve(e.target); }
  }, { rootMargin: '0px 0px -25% 0px' });
  document.querySelectorAll('.case-steps li').forEach((li) => steps.observe(li));

  console.log(
    '%c</> chop-prog%c\n\nRU: Раз вы открыли DevTools, мы уже говорим на одном языке.\n    Нажмите Ctrl+K или наберите на странице «нанять».\nEN: You opened DevTools, so we already speak the same language.\n    Press Ctrl+K, or type “hire” anywhere on the page.\n\nSource: https://github.com/chop-prog/chop-prog.github.io\nTelegram: @chunua4',
    'font: 700 20px ui-monospace, monospace; color: #7cf5d0',
    'font: 13px ui-monospace, monospace; color: #9097b0',
  );
}
