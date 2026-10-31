// "Live from GitHub": on each visit the page asks the GitHub API for the latest
// workflow run of every project, so the board shows real build results, not a
// screenshot. Unauthenticated requests are limited to 60 an hour per visitor, so
// results are cached for the session and fetched only when the section is in view.

export const OWNER = 'chop-prog';
export const REPOS = [
  'relay', 'tandem', 'cite', 'seismic', 'flowboard', 'facet',
  'aurora', 'void-pulse', 'gto-judge-ai', 'job-radar', 'booking-bot', 'chop-prog.github.io',
];
const CACHE_KEY = 'live:v1';
const CACHE_MS = 10 * 60 * 1000;

const TEXT = {
  en: {
    pass: 'passing', fail: 'failing', running: 'running', none: 'no runs',
    push: 'push', schedule: 'weekly schedule', workflow_dispatch: 'manual run', pull_request: 'pull request',
    summary: (ok, total, ago) => `${ok} of ${total} builds passing · last build ${ago}`,
    error: 'GitHub did not answer (the API allows 60 requests an hour per visitor). The repositories are all on',
    now: 'just now',
    units: [['minute', 'minutes'], ['hour', 'hours'], ['day', 'days']],
    ago: (n, unit) => `${n} ${unit} ago`,
  },
  ru: {
    pass: 'тесты прошли', fail: 'тесты упали', running: 'идёт сборка', none: 'нет запусков',
    push: 'push', schedule: 'еженедельно по расписанию', workflow_dispatch: 'ручной запуск', pull_request: 'pull request',
    summary: (ok, total, ago) => `${ok} из ${total} сборок зелёные · последняя сборка ${ago}`,
    error: 'GitHub не ответил (API даёт 60 запросов в час на посетителя). Все репозитории открыты на',
    now: 'только что',
    units: [['минуту', 'минуты', 'минут'], ['час', 'часа', 'часов'], ['день', 'дня', 'дней']],
    ago: (n, unit) => `${n} ${unit} назад`,
  },
};

/** Russian plural form index: 1 минуту, 2 минуты, 5 минут, 21 минуту. */
export function ruPlural(n) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return 0;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 1;
  return 2;
}

export function relTime(iso, now, lang = 'en') {
  const t = TEXT[lang] ?? TEXT.en;
  const min = Math.floor((now - Date.parse(iso)) / 60000);
  if (min < 1) return t.now;
  const [n, u] = min < 60 ? [min, 0] : min < 60 * 24 ? [Math.floor(min / 60), 1] : [Math.floor(min / 1440), 2];
  const forms = t.units[u];
  const word = lang === 'ru' ? forms[ruPlural(n)] : forms[n === 1 ? 0 : 1];
  return t.ago(n, word);
}

/** Reduces a GitHub "list workflow runs" response to what the board shows. */
export function summarize(repo, body) {
  const run = body?.workflow_runs?.[0];
  if (!run) return { repo, state: 'none' };
  const state = run.status !== 'completed' ? 'running' : run.conclusion === 'success' ? 'pass' : 'fail';
  return {
    repo,
    state,
    workflow: run.name,
    event: run.event,
    message: (run.head_commit?.message ?? '').split('\n')[0],
    at: run.updated_at,
    url: run.html_url,
  };
}

export function overall(items) {
  const withRuns = items.filter((i) => i.state !== 'none');
  const latest = withRuns.map((i) => i.at).sort().at(-1) ?? null;
  return { ok: items.filter((i) => i.state === 'pass').length, total: withRuns.length, latest };
}

export async function fetchLive(fetchFn = fetch) {
  return Promise.all(REPOS.map(async (repo) => {
    const res = await fetchFn(`https://api.github.com/repos/${OWNER}/${repo}/actions/runs?per_page=1&branch=main`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    return summarize(repo, await res.json());
  }));
}

function readCache() {
  try {
    const c = JSON.parse(sessionStorage.getItem(CACHE_KEY));
    return c && Date.now() - c.at < CACHE_MS ? c.items : null;
  } catch { return null; }
}

function writeCache(items) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), items })); } catch { /* ignore */ }
}

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export function initLive(root) {
  const list = root.querySelector('.live-list');
  const summary = root.querySelector('.live-summary');
  let items = null;
  let failed = false;

  function render() {
    const lang = document.documentElement.lang === 'ru' ? 'ru' : 'en';
    const t = TEXT[lang];
    const now = Date.now();
    if (failed) {
      summary.textContent = `${t.error} `;
      const a = el('a', null, `github.com/${OWNER}`);
      a.href = `https://github.com/${OWNER}?tab=repositories`;
      a.target = '_blank';
      a.rel = 'noopener';
      summary.append(a);
      summary.dataset.state = 'fail';
      return;
    }
    if (!items) return;
    const o = overall(items);
    summary.textContent = t.summary(o.ok, o.total, o.latest ? relTime(o.latest, now, lang) : '—');
    summary.dataset.state = o.ok === o.total ? 'pass' : 'fail';
    list.replaceChildren(...items.map((i) => {
      const row = el(i.url ? 'a' : 'div', `live-row ${i.state}`);
      if (i.url) { row.href = i.url; row.target = '_blank'; row.rel = 'noopener'; }
      const head = el('span', 'live-head');
      head.append(el('span', 'live-dot'), el('span', 'live-name', i.repo), el('span', 'live-state', t[i.state]));
      row.append(head);
      if (i.state !== 'none') {
        row.append(
          el('span', 'live-msg', i.message),
          el('span', 'live-meta', `${i.workflow} · ${t[i.event] ?? i.event} · ${relTime(i.at, now, lang)}`),
        );
      }
      return row;
    }));
  }

  async function load() {
    items = readCache();
    if (!items) {
      try {
        items = await fetchLive();
        writeCache(items);
      } catch {
        failed = true;
      }
    }
    root.classList.add('loaded');
    render();
  }

  const io = new IntersectionObserver((entries) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    load();
  }, { rootMargin: '300px 0px' });
  io.observe(root);
  document.addEventListener('langchange', render);
}
