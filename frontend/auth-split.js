(function () {
  const root = document.getElementById('auth-split');
  if (!root) return;

  const panes = {
    login: root.querySelector('[data-pane="login"]'),
    register: root.querySelector('[data-pane="register"]')
  };
  const tabs = Array.from(document.querySelectorAll('[data-auth-tab]'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function currentMode() {
    return root.getAttribute('data-mode') === 'register' ? 'register' : 'login';
  }

  function setMode(mode, { pushUrl = true, fromUser = false } = {}) {
    const next = mode === 'register' ? 'register' : 'login';
    const prev = currentMode();
    if (next === prev && !fromUser) {
      // still sync classes on first paint
    }

    root.setAttribute('data-mode', next);
    root.classList.toggle('is-switching', fromUser && !reduceMotion);

    Object.keys(panes).forEach((key) => {
      const pane = panes[key];
      if (!pane) return;
      const active = key === next;
      pane.classList.toggle('is-active', active);
      pane.classList.toggle('is-dimmed', !active);
      pane.setAttribute('aria-hidden', active ? 'false' : 'true');
      const veil = pane.querySelector('.pts-auth-split__veil');
      if (veil) veil.tabIndex = active ? -1 : 0;
      pane.querySelectorAll('input, button, select, textarea').forEach((el) => {
        if (el.closest('.pts-auth-split__veil')) return;
        if (el.hasAttribute('data-auth-keep-enabled')) return;
        el.tabIndex = active ? 0 : -1;
        el.disabled = !active;
      });
    });

    tabs.forEach((tab) => {
      const on = tab.getAttribute('data-auth-tab') === next;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    document.title = next === 'register'
      ? 'สมัครสมาชิก | PTS Learning'
      : 'เข้าสู่ระบบ | PTS Learning';

    if (pushUrl) {
      const url = new URL(location.href);
      if (next === 'register') url.searchParams.set('tab', 'register');
      else url.searchParams.delete('tab');
      // Preserve next= and other params
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }

    if (fromUser && !reduceMotion) {
      window.setTimeout(() => root.classList.remove('is-switching'), 700);
    }
  }

  function modeFromUrl() {
    const params = new URLSearchParams(location.search);
    const tab = (params.get('tab') || params.get('mode') || '').toLowerCase();
    if (tab === 'register' || tab === 'signup' || tab === 'สมัคร') return 'register';
    if (location.hash.replace('#', '').toLowerCase() === 'register') return 'register';
    return 'login';
  }

  // Veil click / keyboard
  root.querySelectorAll('.pts-auth-split__veil').forEach((veil) => {
    veil.addEventListener('click', () => {
      const pane = veil.closest('[data-pane]');
      const target = pane && pane.getAttribute('data-pane');
      if (target) setMode(target, { fromUser: true });
    });
    veil.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      const pane = veil.closest('[data-pane]');
      const target = pane && pane.getAttribute('data-pane');
      if (target) setMode(target, { fromUser: true });
    });
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setMode(tab.getAttribute('data-auth-tab'), { fromUser: true });
    });
  });

  // Foot links that should switch pane instead of navigating
  document.querySelectorAll('[data-auth-switch]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      setMode(el.getAttribute('data-auth-switch'), { fromUser: true });
    });
  });

  setMode(modeFromUrl(), { pushUrl: true, fromUser: false });
  window.ptsAuthSetMode = (mode) => setMode(mode, { fromUser: true });
})();
