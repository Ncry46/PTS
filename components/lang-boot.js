/* PTS language boot — load sync in <head> after theme-boot */
(function () {
  var KEY = 'pts_lang_pref';
  var SUPPORTED = { th: 1, en: 1 };

  function resolve() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved && SUPPORTED[saved]) return saved;
    } catch (_) { /* ignore */ }
    return 'th';
  }

  function applyRoot(lang) {
    var l = SUPPORTED[lang] ? lang : 'th';
    var root = document.documentElement;
    root.setAttribute('lang', l);
    root.setAttribute('data-lang', l);
  }

  function t(key, fallback) {
    var dict = (window.PTSLangDict && window.PTSLangDict[key]) || null;
    var lang = window.PTSLang ? window.PTSLang.get() : resolve();
    if (dict && dict[lang] != null) return dict[lang];
    if (dict && dict.th != null) return dict.th;
    return fallback != null ? fallback : key;
  }

  function setAttr(el, attr, key) {
    var val = t(key);
    if (val == null || val === key) return;
    el.setAttribute(attr, val);
  }

  function apply(root) {
    var scope = root || document;
    var rootEl = document.documentElement;
    rootEl.classList.add('pts-i18n-swapping');
    scope.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (!key) return;
      var val = t(key);
      if (val == null || val === key) return;
      if (el.hasAttribute('data-i18n-html')) el.innerHTML = val;
      else el.textContent = val;
    });
    scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      setAttr(el, 'placeholder', el.getAttribute('data-i18n-placeholder'));
    });
    scope.querySelectorAll('[data-i18n-aria-label]').forEach(function (el) {
      setAttr(el, 'aria-label', el.getAttribute('data-i18n-aria-label'));
    });
    scope.querySelectorAll('[data-i18n-section_title]').forEach(function (el) {
      setAttr(el, 'section_title', el.getAttribute('data-i18n-section_title'));
    });
    scope.querySelectorAll('[data-i18n-value]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-value');
      var val = t(key);
      if (val != null && val !== key) el.value = val;
    });
    requestAnimationFrame(function () {
      rootEl.classList.remove('pts-i18n-swapping');
    });
  }

  applyRoot(resolve());

  window.PTSLang = {
    key: KEY,
    get: function () {
      var cur = document.documentElement.getAttribute('data-lang');
      return SUPPORTED[cur] ? cur : resolve();
    },
    t: t,
    apply: apply,
    set: function (lang) {
      var l = SUPPORTED[lang] ? lang : 'th';
      try { localStorage.setItem(KEY, l); } catch (_) { /* ignore */ }
      applyRoot(l);
      apply(document);
      try {
        document.dispatchEvent(new CustomEvent('pts-lang-change', { detail: { lang: l } }));
      } catch (_) { /* ignore */ }
    }
  };

  function bootApply() {
    apply(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApply);
  } else {
    bootApply();
  }
})();
