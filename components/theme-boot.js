/* PTS theme boot — load sync in <head> to avoid flash */
(function () {
  var KEY = 'pts-theme';

  function resolve() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (_) { /* ignore */ }
    try {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (_) { /* ignore */ }
    return 'light';
  }

  function apply(theme) {
    var t = theme === 'dark' ? 'dark' : 'light';
    var root = document.documentElement;
    root.setAttribute('data-theme', t);
    root.classList.toggle('dark', t === 'dark');
    root.style.colorScheme = t;
  }

  apply(resolve());

  window.PTSTheme = {
    key: KEY,
    get: function () {
      return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    },
    set: function (theme) {
      var t = theme === 'dark' ? 'dark' : 'light';
      try { localStorage.setItem(KEY, t); } catch (_) { /* ignore */ }
      apply(t);
      try {
        document.dispatchEvent(new CustomEvent('pts-theme-change', { detail: { theme: t } }));
      } catch (_) { /* ignore */ }
    },
    toggle: function () {
      this.set(this.get() === 'dark' ? 'light' : 'dark');
    }
  };
})();
