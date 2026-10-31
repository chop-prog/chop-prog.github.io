// Command palette: Ctrl+K (⌘K) or "/" opens a search over every section, project and
// lab demo on the page, plus a few actions. Commands are collected from the DOM when the
// palette opens, so the labels are always in the current language.

const TEXT = {
  en: {
    placeholder: 'Where to? Try “hire”',
    empty: 'Nothing found. Everything else is covered by tests.',
    keys: '↑↓ choose · Enter open · Esc close',
    section: 'Section', project: 'Project', lab: 'Lab', action: 'Action',
    hire: 'Hire chop-prog', hireKw: 'hire job offer contact нанять работа',
    copy: 'Copy Telegram handle', github: 'Open GitHub profile', lang: 'Переключить на русский',
    top: 'Back to the top',
  },
  ru: {
    placeholder: 'Куда дальше? Например, «нанять»',
    empty: 'Ничего не нашлось. Зато всё остальное покрыто тестами.',
    keys: '↑↓ выбрать · Enter открыть · Esc закрыть',
    section: 'Раздел', project: 'Проект', lab: 'Лаборатория', action: 'Действие',
    hire: 'Нанять chop-prog', hireKw: 'нанять работа вакансия оффер контакты hire job',
    copy: 'Скопировать Telegram', github: 'Открыть GitHub', lang: 'Switch to English',
    top: 'Наверх',
  },
};

/** Lower-case and fold ё, so "ёлка" matches "елка". */
const norm = (s) => s.toLowerCase().replace(/ё/g, 'е');

/**
 * Fuzzy score: every query character must appear in order. Consecutive matches and
 * matches at word starts score higher; returns -1 when the query doesn't match.
 */
export function score(query, text) {
  const q = norm(query.trim());
  if (!q) return 0;
  const t = norm(text);
  const at = t.indexOf(q);
  if (at !== -1) return 1000 - at + (at === 0 || /[\s·(«-]/.test(t[at - 1]) ? 200 : 0);
  const chars = [...q].filter((ch) => ch !== ' ');
  // Greedy matching from the first occurrence can miss a much tighter match later on,
  // so try every place the first letter appears and keep the best.
  let best = -1;
  for (let from = t.indexOf(chars[0]); from !== -1; from = t.indexOf(chars[0], from + 1)) {
    let s = 0;
    let last = -2;
    let i = from;
    for (const ch of chars) {
      i = t.indexOf(ch, i);
      if (i === -1) { s = -1; break; }
      s += i === last + 1 ? 8 : 1;
      if (i === 0 || /[\s·(«-]/.test(t[i - 1])) s += 5;
      last = i;
      i++;
    }
    if (s < 0) break; // later starts can't match either
    // Letters scattered across the text are a weaker match than a tight cluster.
    best = Math.max(best, Math.max(0, s - (last - from + 1 - chars.length) * 0.5));
  }
  return best;
}

/** Commands matching the query, best first; the original order breaks ties. */
export function rank(query, commands) {
  return commands
    .map((c, i) => {
      // A keyword hit counts for half: the label is what the visitor reads.
      const k = score(query, c.keywords ?? '');
      return { c, i, s: Math.max(score(query, c.label), k < 0 ? -1 : k / 2) };
    })
    .filter((r) => r.s >= 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((r) => r.c);
}

function collect(t, actions) {
  const cmds = [];
  cmds.push({ label: t.hire, keywords: t.hireKw, kind: t.action, icon: '✓', run: actions.hire });
  for (const a of document.querySelectorAll('.nav nav a')) {
    cmds.push({ label: a.textContent.trim(), kind: t.section, icon: '#', run: () => go(a.getAttribute('href')) });
  }
  for (const card of document.querySelectorAll('.project, .mini')) {
    const name = card.querySelector('h3, h4')?.textContent.trim();
    const link = card.querySelector('.links .btn.primary');
    const tech = card.querySelector('.tech')?.textContent ?? '';
    if (name && link) cmds.push({ label: name, keywords: tech, kind: t.project, icon: '↗', run: () => open(link.href) });
  }
  for (const card of document.querySelectorAll('.lab-card')) {
    const name = card.querySelector('h3')?.textContent.trim();
    const tech = card.querySelector('.lab-tech')?.textContent ?? '';
    if (name) cmds.push({ label: name, keywords: tech, kind: t.lab, icon: '✦', run: () => { location.href = card.href; } });
  }
  cmds.push(
    { label: t.copy, keywords: 'telegram @chunua4 contact', kind: t.action, icon: '⧉', run: actions.copy },
    { label: t.github, keywords: 'github code source', kind: t.action, icon: '↗', run: () => open('https://github.com/chop-prog') },
    { label: t.lang, keywords: 'language язык en ru', kind: t.action, icon: 'Aa', run: actions.toggleLang },
    { label: t.top, keywords: 'top home', kind: t.action, icon: '↑', run: () => scrollTo({ top: 0, behavior: 'smooth' }) },
  );
  return cmds;
}

function go(hash) {
  document.querySelector(hash)?.scrollIntoView({ behavior: 'smooth' });
  history.replaceState(null, '', hash);
}

function open(url) {
  window.open(url, '_blank', 'noopener');
}

export function initPalette(actions) {
  const dlg = document.createElement('dialog');
  dlg.className = 'palette';
  dlg.innerHTML = `
    <div class="pal-box" role="combobox" aria-expanded="true" aria-haspopup="listbox" aria-owns="pal-list">
      <input class="pal-input" type="text" autocomplete="off" spellcheck="false" aria-controls="pal-list" aria-autocomplete="list">
      <kbd class="pal-esc">Esc</kbd>
    </div>
    <ul id="pal-list" class="pal-list" role="listbox"></ul>
    <p class="pal-keys"></p>`;
  document.body.append(dlg);
  const input = dlg.querySelector('.pal-input');
  const list = dlg.querySelector('.pal-list');
  let cmds = [];
  let shown = [];
  let active = 0;
  let t = TEXT.en;

  function render() {
    shown = rank(input.value, cmds);
    active = Math.min(active, Math.max(0, shown.length - 1));
    if (!shown.length) {
      const li = document.createElement('li');
      li.className = 'pal-empty';
      li.textContent = t.empty;
      list.replaceChildren(li);
      input.removeAttribute('aria-activedescendant');
      return;
    }
    list.replaceChildren(...shown.map((c, i) => {
      const li = document.createElement('li');
      li.id = `pal-${i}`;
      li.role = 'option';
      li.className = 'pal-item';
      li.setAttribute('aria-selected', String(i === active));
      li.style.setProperty('--i', String(Math.min(i, 12)));
      const icon = document.createElement('span');
      icon.className = 'pal-icon';
      icon.textContent = c.icon;
      const label = document.createElement('span');
      label.className = 'pal-label';
      label.textContent = c.label;
      const kind = document.createElement('span');
      kind.className = 'pal-kind';
      kind.textContent = c.kind;
      li.append(icon, label, kind);
      li.addEventListener('pointermove', () => { if (active !== i) { active = i; mark(); } });
      li.addEventListener('click', () => run(i));
      return li;
    }));
    input.setAttribute('aria-activedescendant', `pal-${active}`);
  }

  function mark() {
    list.querySelectorAll('.pal-item').forEach((li, i) => li.setAttribute('aria-selected', String(i === active)));
    input.setAttribute('aria-activedescendant', `pal-${active}`);
    list.children[active]?.scrollIntoView({ block: 'nearest' });
  }

  function run(i) {
    const c = shown[i];
    if (!c) return;
    dlg.close();
    c.run();
  }

  function show() {
    if (dlg.open) return;
    t = TEXT[document.documentElement.lang] ?? TEXT.en;
    input.placeholder = t.placeholder;
    dlg.querySelector('.pal-keys').textContent = t.keys;
    cmds = collect(t, actions);
    input.value = '';
    active = 0;
    render();
    dlg.showModal();
    input.focus();
  }

  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, shown.length); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + shown.length) % Math.max(1, shown.length); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(active); }
  });
  // A click on the backdrop (the dialog element itself, outside the box) closes it.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); dlg.open ? dlg.close() : show(); }
    else if (e.key === '/' && !typing && !dlg.open) { e.preventDefault(); show(); }
  });
  for (const b of document.querySelectorAll('[data-palette]')) b.addEventListener('click', show);
  return { show };
}
