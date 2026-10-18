// Shared bits for the lab demos: the same language choice as the portfolio (same origin, same
// localStorage key), English text from data-en attributes, and a link back to the portfolio.
// The demos themselves are written in Russian; LAB.t(ru, en) picks the string at runtime.
(function () {
  var saved = null;
  try { saved = localStorage.getItem('lang'); } catch (e) { /* storage blocked */ }
  var en = saved === 'en' || saved === 'ru' ? saved === 'en' : !/^(ru|uk|be|kk)\b/i.test(navigator.language || '');
  document.documentElement.lang = en ? 'en' : 'ru';
  window.LAB = { en: en, t: function (ru, eng) { return en ? eng : ru; } };

  var css = document.createElement('style');
  css.textContent =
    '.lab-back{position:fixed;z-index:20;top:calc(16px + env(safe-area-inset-top,0px));right:16px;padding:8px 14px;' +
    'border:1px solid rgba(255,255,255,.18);border-radius:99px;background:rgba(7,8,13,.45);color:#fff;' +
    'font:500 13px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;text-decoration:none;' +
    'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);transition:background .2s,border-color .2s}' +
    '.lab-back:hover{background:rgba(7,8,13,.7);border-color:rgba(255,255,255,.4)}' +
    '.lab-back:focus-visible{outline:2px solid #7cf5d0;outline-offset:3px}';
  document.head.appendChild(css);

  document.addEventListener('DOMContentLoaded', function () {
    if (en) {
      document.querySelectorAll('[data-en]').forEach(function (el) { el.textContent = el.getAttribute('data-en'); });
      if (document.body.dataset.titleEn) document.title = document.body.dataset.titleEn;
    }
    var a = document.createElement('a');
    a.className = 'lab-back';
    a.href = '../../#lab';
    a.textContent = en ? '← chop-prog · Lab' : '← chop-prog · Лаборатория';
    document.body.appendChild(a);
  });
})();
