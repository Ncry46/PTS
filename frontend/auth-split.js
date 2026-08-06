(function () {
  const root = document.getElementById('auth-split');
  if (!root) return;

  const cover = document.getElementById('auth-cover');
  const panes = {
    login: root.querySelector('[data-pane="login"]'),
    register: root.querySelector('[data-pane="register"]')
  };
  const tabs = Array.from(document.querySelectorAll('[data-auth-tab]'));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SLIDE_MS = 920;
  let sliding = false;
  let slideTimer = 0;

  function currentMode() {
    return root.getAttribute('data-mode') === 'register' ? 'register' : 'login';
  }

  function coveredMode() {
    // Cover sits on the inactive side
    return currentMode() === 'login' ? 'register' : 'login';
  }

  function syncCoverLabel() {
    if (!cover) return;
    const target = coveredMode();
    cover.setAttribute(
      'aria-label',
      target === 'register' ? 'สลับไปสมัครสมาชิก' : 'สลับไปเข้าสู่ระบบ'
    );
  }

  function setMode(mode, { pushUrl = true, fromUser = false } = {}) {
    const next = mode === 'register' ? 'register' : 'login';
    const prev = currentMode();
    if (next === prev && fromUser) return;

    if (fromUser && !reduceMotion && prev !== next) {
      sliding = true;
      root.classList.add('is-sliding');
      root.dataset.slideFrom = prev;
      root.dataset.slideTo = next;
      window.clearTimeout(slideTimer);
      slideTimer = window.setTimeout(() => {
        sliding = false;
        root.classList.remove('is-sliding');
        delete root.dataset.slideFrom;
        delete root.dataset.slideTo;
      }, SLIDE_MS);
    }

    root.setAttribute('data-mode', next);

    Object.keys(panes).forEach((key) => {
      const pane = panes[key];
      if (!pane) return;
      const active = key === next;
      pane.classList.toggle('is-active', active);
      pane.classList.toggle('is-dimmed', !active);
      pane.setAttribute('aria-hidden', active ? 'false' : 'true');
      pane.querySelectorAll('input, button, select, textarea').forEach((el) => {
        if (el.hasAttribute('data-auth-keep-enabled')) return;
        if (el.closest('.pts-auth-split__cover')) return;
        el.tabIndex = active ? 0 : -1;
        el.disabled = !active;
      });
    });

    tabs.forEach((tab) => {
      const on = tab.getAttribute('data-auth-tab') === next;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    document.section_title = next === 'register'
      ? 'สมัครสมาชิก | PTS Learning'
      : 'เข้าสู่ระบบ | PTS Learning';

    syncCoverLabel();

    if (pushUrl) {
      const url = new URL(location.href);
      if (next === 'register') url.searchParams.set('tab', 'register');
      else url.searchParams.delete('tab');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }

  function modeFromUrl() {
    const params = new URLSearchParams(location.search);
    const tab = (params.get('tab') || params.get('mode') || '').toLowerCase();
    if (tab === 'register' || tab === 'signup' || tab === 'สมัคร') return 'register';
    if (location.hash.replace('#', '').toLowerCase() === 'register') return 'register';
    return 'login';
  }

  function switchToCovered() {
    if (sliding) return;
    setMode(coveredMode(), { fromUser: true });
  }

  if (cover) {
    cover.addEventListener('click', switchToCovered);
    cover.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      switchToCovered();
    });

    // Soft parallax on cover FX layers
    if (!reduceMotion) {
      cover.addEventListener('pointermove', (e) => {
        if (window.innerWidth < 900) return;
        const rect = cover.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width - 0.5;
        const ny = (e.clientY - rect.top) / rect.height - 0.5;
        const fx = cover.querySelector('.pts-auth-split__cover-fx');
        if (fx) fx.style.transform = `translate3d(${nx * 18}px, ${ny * 14}px, 0) scale(1.04)`;
        cover.querySelectorAll('.pts-auth-split__blob').forEach((el, i) => {
          const m = 8 + i * 4;
          el.style.translate = `${nx * m}px ${ny * m}px`;
        });
        cover.querySelectorAll('.pts-auth-split__orb').forEach((el, i) => {
          const m = 12 + i * 3;
          el.style.translate = `${nx * -m}px ${ny * -m}px`;
        });
      });
      cover.addEventListener('pointerleave', () => {
        const fx = cover.querySelector('.pts-auth-split__cover-fx');
        if (fx) fx.style.transform = '';
        cover.querySelectorAll('.pts-auth-split__blob, .pts-auth-split__orb').forEach((el) => {
          el.style.translate = '';
        });
      });
    }
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      if (sliding) return;
      setMode(tab.getAttribute('data-auth-tab'), { fromUser: true });
    });
  });

  document.querySelectorAll('[data-auth-switch]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      if (sliding) return;
      setMode(el.getAttribute('data-auth-switch'), { fromUser: true });
    });
  });

  setMode(modeFromUrl(), { pushUrl: true, fromUser: false });
  window.ptsAuthSetMode = (mode) => {
    if (sliding) return;
    setMode(mode, { fromUser: true });
  };
})();
