/* PTS shared top navigation — self-contained so the header always shows */
(function () {
  const PTS_LOGO =
    '/logo.png';

  function ensureThemeApi() {
    if (window.PTSTheme) return window.PTSTheme;
    var KEY = 'pts-theme';
    function resolve() {
      try {
        var saved = localStorage.getItem(KEY);
        if (saved === 'dark' || saved === 'light') return saved;
      } catch (_) { /* ignore */ }
      try {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
      } catch (_) { /* ignore */ }
      return 'light';
    }
    function apply(theme) {
      var t = theme === 'dark' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.classList.toggle('dark', t === 'dark');
      document.documentElement.style.colorScheme = t;
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
      toggle: function () { this.set(this.get() === 'dark' ? 'light' : 'dark'); }
    };
    return window.PTSTheme;
  }

  function escapeAttr(t) {
    return String(t || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function t(key, fallback) {
    if (window.PTSLang && typeof window.PTSLang.t === 'function') {
      return window.PTSLang.t(key, fallback);
    }
    return fallback != null ? fallback : key;
  }

  function langToggleHtml() {
    const lang = (window.PTSLang && window.PTSLang.get()) || 'th';
    return `
      <div class="pts-lang-toggle" role="group" aria-label="${escapeAttr(t('nav.lang', 'ภาษา'))}">
        <button type="button" class="pts-lang-toggle__btn${lang === 'th' ? ' is-active' : ''}" data-pts-lang="th" data-i18n="nav.lang.th">${t('nav.lang.th', 'ไทย')}</button>
        <button type="button" class="pts-lang-toggle__btn${lang === 'en' ? ' is-active' : ''}" data-pts-lang="en" data-i18n="nav.lang.en">${t('nav.lang.en', 'EN')}</button>
      </div>`;
  }

  function themeToggleHtml() {
    return `
      <button type="button" class="pts-theme-toggle" data-pts-theme-toggle
        aria-label="${escapeAttr(t('nav.themeToggle', 'สลับโหมดมืด/สว่าง'))}" section_title="${escapeAttr(t('nav.themeToggle', 'สลับโหมดมืด/สว่าง'))}">
        <svg class="pts-theme-icon--moon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M21 14.3A9 9 0 1 1 9.7 3a7 7 0 1 0 11.3 11.3Z"
            stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
        <svg class="pts-theme-icon--sun" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" stroke-width="1.8"/>
          <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
            stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
        </svg>
      </button>`;
  }

  function syncThemeToggle(root) {
    const theme = ensureThemeApi();
    const btn = root.querySelector('[data-pts-theme-toggle]');
    if (!btn) return;
    const label = theme.get() === 'dark'
      ? t('nav.themeToLight', 'สลับเป็นโหมดสว่าง')
      : t('nav.themeToDark', 'สลับเป็นโหมดมืด');
    btn.setAttribute('aria-label', label);
    btn.section_title = label;
    btn.onclick = (e) => {
      e.preventDefault();
      theme.toggle();
      syncThemeToggle(root);
    };
  }

  function syncLangToggle(root) {
    root.querySelectorAll('[data-pts-lang]').forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const next = btn.getAttribute('data-pts-lang');
        if (window.PTSLang && typeof window.PTSLang.set === 'function') {
          window.PTSLang.set(next);
        } else {
          try { localStorage.setItem('pts_lang_pref', next); } catch (_) { /* ignore */ }
          document.documentElement.setAttribute('lang', next);
          document.documentElement.setAttribute('data-lang', next);
        }
      };
    });
  }

  function ensureCriticalCss() {
    if (document.getElementById('pts-nav-critical')) return;
    const style = document.createElement('style');
    style.id = 'pts-nav-critical';
    style.textContent = `
      #app-navbar { display:block !important; min-height:68px; }
      .pts-topnav {
        position:fixed !important; top:0; left:0; right:0; z-index:99999 !important;
        height:68px; background:var(--pts-nav-bg,#fff) !important;
        border-bottom:1px solid var(--pts-border,rgba(151,66,88,.18));
        box-shadow:var(--pts-shadow-sm,0 2px 12px rgba(28,21,32,.06));
        font-family:'LINE Seed Sans TH',sans-serif;
        color:var(--pts-text,#1c1520);
      }
      .pts-topnav__inner {
        max-width:none; width:100%; margin:0; height:100%; padding:0 16px;
        display:flex; align-items:center; justify-content:space-between; gap:12px;
        box-sizing:border-box;
      }
      .pts-topnav__start {
        display:flex; align-items:center; gap:4px; min-width:0; flex-shrink:0;
      }
      .pts-topnav__brand { display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--pts-text,#1c1520); flex-shrink:1; min-width:0; }
      .pts-topnav__logo { height:42px; width:auto; max-width:160px; object-fit:contain; display:block; }
      .pts-topnav__mark { display:none !important; }
      .pts-topnav__name { font-weight:700; font-size:15px; line-height:1.15; color:var(--pts-text,#1c1520); }
      .pts-topnav__tag { font-size:11px; color:var(--pts-muted,#6b5c62); font-weight:500; }
      .pts-topnav__links { display:none; align-items:center; gap:6px; }
      .pts-topnav__link {
        padding:8px 12px; border-radius:999px; text-decoration:none; color:var(--pts-muted,#4b3f44);
        font-size:14px; font-weight:600;
      }
      .pts-topnav__link:hover { background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#ca1156); }
      .pts-topnav__mega-wrap { position:relative; height:100%; display:flex; align-items:center; }
      .pts-topnav__mega-btn {
        padding:8px 12px; border-radius:999px; border:none; background:transparent; cursor:pointer;
        font:inherit; font-size:14px; font-weight:600; color:var(--pts-muted,#4b3f44); display:inline-flex; align-items:center; gap:4px;
      }
      .pts-topnav__mega-btn:hover, .pts-topnav__mega-wrap:hover .pts-topnav__mega-btn {
        background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#ca1156);
      }
      .pts-topnav__mega {
        display:none; position:absolute; top:100%; left:0; width:420px; padding-top:8px; z-index:100001;
      }
      .pts-topnav__mega-wrap:hover .pts-topnav__mega,
      .pts-topnav__mega-wrap:focus-within .pts-topnav__mega { display:block; }
      .pts-topnav__mega-panel {
        background:var(--pts-surface,#fff); border:1px solid var(--pts-border,rgba(151,66,88,.16)); border-radius:16px;
        box-shadow:var(--pts-shadow,0 16px 40px rgba(28,21,32,.12)); overflow:hidden;
      }
      .pts-topnav__mega-item {
        display:flex; gap:12px; align-items:flex-start; width:100%; text-align:left; padding:14px 16px;
        border:none; background:transparent; cursor:pointer; font:inherit; color:var(--pts-text,#1c1520);
      }
      .pts-topnav__mega-item:hover { background:var(--pts-nav-hover,#faf4f6); }
      .pts-topnav__mega-icon {
        width:40px; height:40px; border-radius:999px; display:grid; place-items:center; flex-shrink:0;
        font-size:12px; font-weight:800; letter-spacing:.02em; background:var(--pts-primary-soft,#f6e6ea); color:var(--pts-primary,#ca1156);
      }
      .pts-topnav__mega-icon--onsite { background:#eef5ea; color:#007ede; }
      .pts-topnav__mega-icon--hybrid { background:#e8f6ec; color:#166c39; }
      html[data-theme="dark"] .pts-topnav__mega-icon--onsite { background:rgba(76,101,72,.28); color:#b3ceab; }
      html[data-theme="dark"] .pts-topnav__mega-icon--hybrid { background:rgba(22,108,57,.28); color:#a2f5b4; }
      .pts-topnav__mega-section_title { font-size:15px; font-weight:700; margin:0 0 2px; }
      .pts-topnav__mega-desc { font-size:13px; color:var(--pts-muted,#6b5c62); margin:0; line-height:1.4; }
      .pts-topnav__mega-foot {
        padding:12px 16px; border-top:1px solid var(--pts-border,rgba(151,66,88,.12));
        background:color-mix(in srgb, var(--pts-surface,#fff) 92%, var(--pts-primary,#ca1156));
      }
      .pts-topnav__mega-foot a {
        display:flex; align-items:center; justify-content:center; height:40px; border-radius:999px;
        background:var(--pts-primary,#ca1156); color:#fff; text-decoration:none; font-weight:700; font-size:14px;
      }
      .pts-topnav__actions { display:flex; align-items:center; gap:8px; margin-left:auto; }
      .pts-topnav__btn {
        display:inline-flex; align-items:center; justify-content:center; height:40px; padding:0 16px;
        border-radius:999px; text-decoration:none; font-size:14px; font-weight:700; white-space:nowrap;
      }
      .pts-topnav__btn--ghost {
        border:1px solid color-mix(in srgb, var(--pts-primary,#ca1156) 35%, transparent);
        color:var(--pts-primary,#ca1156); background:var(--pts-surface,#fff);
      }
      .pts-topnav__btn--auth { border:1px solid color-mix(in srgb, var(--pts-primary,#ca1156) 35%, transparent); color:var(--pts-primary,#ca1156); background:var(--pts-surface,#fff); position:relative; overflow:hidden; display:inline-flex; align-items:center; gap:6px; }
      .pts-topnav__btn--auth svg { width:15px; height:15px; flex-shrink:0; }
      .pts-topnav__btn--auth.is-active { background:var(--pts-primary,#ca1156); color:#fff; border-color:var(--pts-primary,#ca1156); box-shadow:0 4px 18px color-mix(in srgb, var(--pts-primary,#ca1156) 40%, transparent); animation:pts-btn-glow 2.4s ease-in-out infinite; }
      .pts-topnav__btn--auth.is-active::after { content:''; position:absolute; top:0; left:0; width:55%; height:100%; background:linear-gradient(105deg, transparent, rgba(255,255,255,.5), transparent); transform:translateX(-130%); animation:pts-btn-shine 2.4s ease-in-out infinite; pointer-events:none; }
      @keyframes pts-btn-shine { 0% { transform:translateX(-130%); } 55%, 100% { transform:translateX(260%); } }
      @keyframes pts-btn-glow { 0%,100% { box-shadow:0 4px 16px color-mix(in srgb, var(--pts-primary,#ca1156) 35%, transparent); } 50% { box-shadow:0 6px 26px color-mix(in srgb, var(--pts-primary,#ca1156) 55%, transparent); } }
      .pts-topnav__btn--primary { background:var(--pts-primary,#ca1156); color:#fff; border:none; }
      .pts-topnav__icon {
        width:40px; height:40px; border:none; border-radius:999px; background:transparent;
        color:var(--pts-muted,#5c4f55); display:grid; place-items:center; cursor:pointer; text-decoration:none;
      }
      .pts-topnav__icon:hover { background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#ca1156); }
      .pts-lang-toggle {
        display:inline-flex; align-items:center; gap:2px; padding:3px;
        border:1px solid var(--pts-border,rgba(151,66,88,.18)); border-radius:999px;
        background:var(--pts-surface,#fff); flex-shrink:0;
      }
      .pts-lang-toggle__btn {
        border:none; background:transparent; cursor:pointer; font:inherit;
        font-size:12px; font-weight:700; color:var(--pts-muted,#5c4f55);
        padding:6px 9px; border-radius:999px; line-height:1;
      }
      .pts-lang-toggle__btn.is-active {
        background:var(--pts-primary,#ca1156); color:#fff;
      }
      .pts-lang-toggle__btn:hover:not(.is-active) {
        background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#ca1156);
      }
      .pts-theme-toggle {
        width:40px; height:40px; border:1px solid var(--pts-border,rgba(151,66,88,.18)); border-radius:999px;
        background:var(--pts-surface,#fff); color:var(--pts-text,#1c1520);
        display:grid; place-items:center; cursor:pointer; flex-shrink:0;
      }
      .pts-theme-toggle:hover {
        background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#ca1156);
      }
      .pts-theme-toggle svg { width:20px; height:20px; display:block; }
      .pts-theme-toggle .pts-theme-icon--sun { display:none; }
      .pts-theme-toggle .pts-theme-icon--moon { display:block; }
      html[data-theme="dark"] .pts-theme-toggle .pts-theme-icon--sun { display:block; }
      html[data-theme="dark"] .pts-theme-toggle .pts-theme-icon--moon { display:none; }
      .pts-topnav__burger {
        display:grid; place-items:center; width:40px; height:40px; flex-shrink:0;
        border:none; border-radius:999px; background:transparent;
        color:var(--pts-muted,#5c4f55); font-size:20px; line-height:1; cursor:pointer;
      }
      .pts-topnav__burger:hover { background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#ca1156); }
      .pts-topnav__burger[aria-expanded="true"] {
        background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#ca1156);
      }
      .pts-topnav__mobile {
        display:none; border-top:1px solid var(--pts-border,rgba(151,66,88,.14));
        background:var(--pts-nav-bg,#fff); padding:8px 16px 14px;
      }
      .pts-topnav__mobile.is-open { display:block; }
      .pts-topnav__mobile a, .pts-topnav__mobile button {
        display:block; width:100%; text-align:left; padding:12px 8px; border:none; background:transparent;
        font:inherit; font-weight:600; color:var(--pts-text,#1c1520); text-decoration:none; border-radius:10px; cursor:pointer;
      }
      .pts-topnav__mobile a:hover, .pts-topnav__mobile button:hover { background:var(--pts-nav-hover,#f6e6ea); }
      .pts-topnav__user-wrap { position:relative; }
      .pts-topnav__user {
        display:flex; align-items:center; gap:8px; border:none; background:transparent; cursor:pointer;
        padding:4px; border-radius:999px; color:var(--pts-text,#1c1520);
      }
      .pts-topnav__user:hover, .pts-topnav__user-wrap.is-open .pts-topnav__user {
        background:var(--pts-nav-hover,#f6e6ea);
      }
      .pts-topnav__user img {
        width:36px; height:36px; border-radius:999px; object-fit:cover;
        border:2px solid var(--pts-primary-soft,#f6e6ea);
      }
      .pts-topnav__drop {
        display:none; flex-direction:column; position:absolute; top:calc(100% + 8px); right:0; z-index:100002;
        width:min(280px, calc(100vw - 24px)); padding:0;
        background:var(--pts-surface,#fff);
        border:1px solid var(--pts-border,rgba(151,66,88,.16));
        border-radius:14px;
        box-shadow:var(--pts-shadow,0 16px 40px rgba(28,21,32,.14));
        overflow:hidden; max-height:min(70vh, 520px);
      }
      .pts-topnav__user-wrap.is-open .pts-topnav__drop { display:flex; }
      .pts-topnav__drop-head {
        display:flex; align-items:center; gap:10px; padding:14px 14px 12px;
        border-bottom:1px solid var(--pts-border,rgba(151,66,88,.12));
        background:linear-gradient(180deg, var(--pts-nav-hover,#faf4f6), var(--pts-surface,#fff));
        flex-shrink:0;
      }
      .pts-topnav__drop-head img {
        width:40px; height:40px; border-radius:999px; object-fit:cover;
        border:2px solid var(--pts-primary-soft,#f6e6ea); flex-shrink:0;
      }
      .pts-topnav__drop-name { font-size:14px; font-weight:700; color:var(--pts-text,#1c1520); line-height:1.2; }
      .pts-topnav__drop-role {
        font-size:11px; font-weight:700; color:var(--pts-primary,#ca1156);
        text-transform:uppercase; letter-spacing:.04em; margin-top:2px;
      }
      .pts-topnav__drop-nav { padding:6px; overflow-y:auto; flex:1; min-height:0; }
      .pts-topnav__drop-nav a, .pts-topnav__drop-nav button {
        display:flex; align-items:center; width:100%; text-align:left; padding:11px 12px;
        border:none; background:transparent; font:inherit; font-size:14px; font-weight:600;
        color:var(--pts-text,#1c1520); text-decoration:none; border-radius:10px; cursor:pointer;
      }
      .pts-topnav__drop-nav a:hover, .pts-topnav__drop-nav button:hover {
        background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#ca1156);
      }
      .pts-topnav__drop-logout {
        color:#ba1a1a !important; margin-top:4px;
        border-top:1px solid var(--pts-border,rgba(151,66,88,.1)) !important;
        border-radius:0 0 10px 10px !important; padding-top:14px !important;
      }
      .pts-topnav__drop-logout:hover {
        background:rgba(186,26,26,.1) !important; color:#d32f2f !important;
      }
      html[data-theme="dark"] .pts-topnav__drop-logout { color:#f07178 !important; }
      html[data-theme="dark"] .pts-topnav__drop-logout:hover {
        background:rgba(186,26,26,.16) !important; color:#ff8a8a !important;
      }
      @media (min-width:768px) {
        .pts-topnav__inner { padding:0 28px; }
        .pts-topnav__btn--desktop { display:inline-flex !important; }
      }
      @media (min-width:1200px) {
        .pts-topnav__inner { padding:0 40px; }
      }
      @media (min-width:1024px) {
        .pts-topnav__links { display:flex; }
        .pts-topnav__burger { display:none !important; }
        .pts-topnav__mobile { display:none !important; }
      }
      @media (min-width:640px) {
        .pts-topnav__user-meta { display:block !important; }
      }
      @media (max-width:767px) {
        .pts-topnav__btn--desktop { display:none !important; }
        .pts-topnav__tag { display:none; }
      }
    `;
    document.head.appendChild(style);
  }

  function brandHtml() {
    return `
      <a class="pts-topnav__brand" href="Home.html" aria-label="PTS Learning">
        <img class="pts-topnav__logo" src="${PTS_LOGO}" alt="PTS Learning"
          onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
        <span class="pts-topnav__mark" style="display:none" aria-hidden="true">PTS</span>
        <span>
          <div class="pts-topnav__name">PTS Learning</div>
          <div class="pts-topnav__tag">Personal Assistant Academy</div>
        </span>
      </a>`;
  }

  function burgerHtml() {
    return `
      <button type="button" class="pts-topnav__burger" data-pts-burger
        aria-label="${escapeAttr(t('nav.openMenu', 'เปิดเมนู'))}" aria-expanded="false" aria-controls="pts-mobile-nav">☰</button>`;
  }

  function coursesMegaHtml() {
    return `
      <div class="pts-topnav__mega-wrap">
        <button type="button" class="pts-topnav__mega-btn" aria-haspopup="true">
          <span data-i18n="nav.courses">${t('nav.courses', 'หลักสูตร')}</span> <span aria-hidden="true">▾</span>
        </button>
        <div class="pts-topnav__mega" role="menu">
          <div class="pts-topnav__mega-panel">
            <button type="button" class="pts-topnav__mega-item" data-mega-filter="online">
              <span class="pts-topnav__mega-icon">On</span>
              <span>
                <p class="pts-topnav__mega-section_title">Online</p>
                <p class="pts-topnav__mega-desc" data-i18n="nav.mega.online">${t('nav.mega.online', 'เรียนผ่านเว็บไซต์ เรียนได้ทุกที่ ทุกเวลา')}</p>
              </span>
            </button>
            <button type="button" class="pts-topnav__mega-item" data-mega-filter="onsite">
              <span class="pts-topnav__mega-icon pts-topnav__mega-icon--onsite">Os</span>
              <span>
                <p class="pts-topnav__mega-section_title">Onsite</p>
                <p class="pts-topnav__mega-desc" data-i18n="nav.mega.onsite">${t('nav.mega.onsite', 'เรียนที่ PTS Academy พร้อมเช็กอินผ่าน QR Code')}</p>
              </span>
            </button>
            <button type="button" class="pts-topnav__mega-item" data-mega-filter="hybrid">
              <span class="pts-topnav__mega-icon pts-topnav__mega-icon--hybrid">Hy</span>
              <span>
                <p class="pts-topnav__mega-section_title">Hybrid</p>
                <p class="pts-topnav__mega-desc" data-i18n="nav.mega.hybrid">${t('nav.mega.hybrid', 'เรียนทั้งออนไลน์และออนไซต์ในหลักสูตรเดียว')}</p>
              </span>
            </button>
            <div class="pts-topnav__mega-foot">
              <a href="Courses.html" data-i18n="nav.coursesAll">${t('nav.coursesAll', 'ดูหลักสูตรทั้งหมด')}</a>
            </div>
          </div>
        </div>
      </div>`;
  }

  function coursesMobileHtml() {
    return `
      <a href="Courses.html" data-i18n="nav.coursesAllShort">${t('nav.coursesAllShort', 'หลักสูตรทั้งหมด')}</a>
      <a href="Courses.html?filter=online">· Online</a>
      <a href="Courses.html?filter=onsite">· Onsite</a>
      <a href="Courses.html?filter=hybrid">· Hybrid</a>`;
  }

  function profileMenuHtml(name, roleLabel, avatar, isAdmin) {
    // Align with sidebars: student → user-sidebar, admin → Admin.html tabs
    const studentLinks = `
          <a href="DashbordU.html" role="menuitem" data-i18n="nav.dashboard">${t('nav.dashboard', 'แดชบอร์ด')}</a>
          <a href="MyCourses.html" role="menuitem" data-i18n="nav.mycourses">${t('nav.mycourses', 'หลักสูตรของฉัน')}</a>
          <a href="Payments.html" role="menuitem" data-i18n="nav.payments">${t('nav.payments', 'การชำระเงิน')}</a>
          <a href="Forms.html" role="menuitem" data-i18n="nav.forms">${t('nav.forms', 'แบบฟอร์ม')}</a>
          <a href="Certificates.html" role="menuitem" data-i18n="nav.certificates">${t('nav.certificates', 'ใบประกาศ')}</a>
          <a href="Favorites.html" role="menuitem" data-i18n="nav.favorites">${t('nav.favorites', 'รายการโปรด')}</a>
          <a href="Schedule.html" role="menuitem" data-i18n="nav.schedule">${t('nav.schedule', 'ตารางเรียน')}</a>
          <a href="Notifications.html" role="menuitem" data-i18n="nav.notifications">${t('nav.notifications', 'การแจ้งเตือน')}</a>
          <a href="Settings.html" role="menuitem" data-i18n="nav.settings">${t('nav.settings', 'ตั้งค่า')}</a>`;

    const adminLinks = `
          <a href="Admin.html#courses" role="menuitem" data-i18n="nav.admin.courses">${t('nav.admin.courses', 'หลักสูตร')}</a>
          <a href="Admin.html#lessons" role="menuitem" data-i18n="nav.admin.lessons">${t('nav.admin.lessons', 'บทเรียน')}</a>
          <a href="Admin.html#schedules" role="menuitem" data-i18n="nav.admin.schedules">${t('nav.admin.schedules', 'ตารางเรียน')}</a>
          <a href="Admin.html#forms" role="menuitem" data-i18n="nav.admin.forms">${t('nav.admin.forms', 'แบบฟอร์ม')}</a>
          <a href="Admin.html#banners" role="menuitem" data-i18n="nav.admin.banners">${t('nav.admin.banners', 'แบนเนอร์')}</a>
          <a href="Admin.html#cert" role="menuitem" data-i18n="nav.admin.cert">${t('nav.admin.cert', 'ใบประกาศ')}</a>
          <a href="Admin.html#users" role="menuitem" data-i18n="nav.admin.users">${t('nav.admin.users', 'ผู้ใช้')}</a>
          <a href="Admin.html#posts" role="menuitem" data-i18n="nav.admin.posts">${t('nav.admin.posts', 'โพสต์')}</a>
          <a href="Admin.html#payments" role="menuitem" data-i18n="nav.admin.payments">${t('nav.admin.payments', 'ชำระเงิน')}</a>
          <a href="Admin.html#coupons" role="menuitem" data-i18n="nav.admin.coupons">${t('nav.admin.coupons', 'คูปองส่วนลด')}</a>
          <a href="Admin.html#audit" role="menuitem" data-i18n="nav.admin.audit">${t('nav.admin.audit', 'ประวัติแอดมิน')}</a>
          <a href="Admin.html#mail" role="menuitem" data-i18n="nav.admin.mail">${t('nav.admin.mail', 'อีเมล OTP')}</a>
          <a href="Settings.html" role="menuitem" data-i18n="nav.settings">${t('nav.settings', 'ตั้งค่าโปรไฟล์')}</a>`;

    return `
      <div class="pts-topnav__user-wrap" data-pts-user-wrap>
        <button type="button" class="pts-topnav__user" data-pts-user
          aria-label="${escapeAttr(t('nav.openAccount', 'เปิดเมนูบัญชี'))}" aria-expanded="false" aria-haspopup="true" aria-controls="pts-user-menu">
          <span style="display:none;text-align:right;line-height:1.15" class="pts-topnav__user-meta">
            <span style="display:block;font-size:13px;font-weight:700">${name}</span>
            <span style="display:block;font-size:10px;font-weight:700;color:var(--pts-primary,#ca1156);text-transform:uppercase">${roleLabel}</span>
          </span>
          <img src="${avatar}" alt="" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=P&background=F8BBD0&color=880E4F&size=128'">
        </button>
        <div class="pts-topnav__drop" id="pts-user-menu" data-pts-user-drop role="menu" hidden>
          <div class="pts-topnav__drop-head">
            <img src="${avatar}" alt="" onerror="this.onerror=null;this.src='https://ui-avatars.com/api/?name=P&background=F8BBD0&color=880E4F&size=128'">
            <div>
              <div class="pts-topnav__drop-name">${name}</div>
              <div class="pts-topnav__drop-role">${roleLabel}</div>
            </div>
          </div>
          <nav class="pts-topnav__drop-nav">
            ${isAdmin ? adminLinks : studentLinks}
            <button type="button" class="pts-topnav__drop-logout" role="menuitem" onclick="logout()" data-i18n="nav.logout">${t('nav.logout', 'ออกจากระบบ')}</button>
          </nav>
        </div>
      </div>`;
  }

  function setMobileOpen(root, open) {
    const burger = root.querySelector('[data-pts-burger]');
    const mobile = root.querySelector('[data-pts-mobile]');
    if (!burger || !mobile) return;
    mobile.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    burger.setAttribute('aria-label', open ? t('nav.closeMenu', 'ปิดเมนู') : t('nav.openMenu', 'เปิดเมนู'));
  }

  function setProfileOpen(wrap, open) {
    if (!wrap) return;
    const btn = wrap.querySelector('[data-pts-user]');
    const drop = wrap.querySelector('[data-pts-user-drop]');
    wrap.classList.toggle('is-open', open);
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? t('nav.closeAccount', 'ปิดเมนูบัญชี') : t('nav.openAccount', 'เปิดเมนูบัญชี'));
    }
    if (drop) {
      if (open) drop.removeAttribute('hidden');
      else drop.setAttribute('hidden', '');
    }
  }

  function closeAllMenus(root) {
    if (!root) root = document.getElementById('app-navbar');
    if (!root) return;
    setMobileOpen(root, false);
    const wrap = root.querySelector('[data-pts-user-wrap]');
    setProfileOpen(wrap, false);
  }

  function bindToggles(root) {
    const burger = root.querySelector('[data-pts-burger]');
    const mobile = root.querySelector('[data-pts-mobile]');
    const wrap = root.querySelector('[data-pts-user-wrap]');
    const userBtn = root.querySelector('[data-pts-user]');

    if (burger && mobile) {
      burger.onclick = (e) => {
        e.stopPropagation();
        const willOpen = !mobile.classList.contains('is-open');
        setProfileOpen(wrap, false);
        setMobileOpen(root, willOpen);
      };
    }

    if (userBtn && wrap) {
      userBtn.onclick = (e) => {
        e.stopPropagation();
        const willOpen = !wrap.classList.contains('is-open');
        setMobileOpen(root, false);
        setProfileOpen(wrap, willOpen);
      };
    }
  }

  function renderGuest(container) {
    container.innerHTML = `
      <nav class="pts-topnav" data-i18n-aria-label="nav.main" aria-label="${escapeAttr(t('nav.main', 'เมนูหลัก'))}">
        <div class="pts-topnav__inner">
          <div class="pts-topnav__start">
            ${burgerHtml()}
            ${brandHtml()}
          </div>
          <div class="pts-topnav__links">
            <a class="pts-topnav__link" href="Home.html" data-i18n="nav.home">${t('nav.home', 'หน้าแรก')}</a>
            ${coursesMegaHtml()}
            <a class="pts-topnav__link" href="Community.html" data-i18n="nav.community">${t('nav.community', 'คอมมูนิตี้')}</a>
          </div>
          <div class="pts-topnav__actions">
            <a class="pts-topnav__btn pts-topnav__btn--auth pts-topnav__btn--login pts-topnav__btn--desktop" href="Login.html" data-i18n="nav.login"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-2.6 2.6-4 7-4s7 1.4 7 4"/></svg>${t('nav.login', 'เข้าสู่ระบบ')}</a>
            <a class="pts-topnav__btn pts-topnav__btn--auth pts-topnav__btn--register pts-topnav__btn--desktop" href="Login.html?tab=register" data-i18n="nav.register"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c0-2.6 2.6-4 7-4s7 1.4 7 4"/><path d="M16 11h6M19 8v6"/></svg>${t('nav.register', 'สมัครสมาชิก')}</a>
            ${langToggleHtml()}
            ${themeToggleHtml()}
          </div>
        </div>
        <div class="pts-topnav__mobile" id="pts-mobile-nav" data-pts-mobile>
          <a href="Home.html" data-i18n="nav.home">${t('nav.home', 'หน้าแรก')}</a>
          ${coursesMobileHtml()}
          <a href="Community.html" data-i18n="nav.community">${t('nav.community', 'คอมมูนิตี้')}</a>
          <a href="Login.html" data-i18n="nav.login">${t('nav.login', 'เข้าสู่ระบบ')}</a>
          <a href="Login.html?tab=register" style="color:#CA1156;font-weight:700" data-i18n="nav.register">${t('nav.register', 'สมัครสมาชิก')}</a>
        </div>
      </nav>`;
    bindToggles(container);
    syncThemeToggle(container);
    syncLangToggle(container);
    const isRegister = /[?&]tab=register/.test(location.search);
    container.querySelector(isRegister ? '.pts-topnav__btn--register' : '.pts-topnav__btn--login')?.classList.add('is-active');
  }

  function renderLoggedIn(container, user) {
    const userRole = String(user.role || user.Role || '').toLowerCase();
    const isAdmin = userRole === 'admin';
    const name = escapeAttr(user.name || t('common.user', 'ผู้ใช้'));
    const avatar = escapeAttr(
      user.Url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'P')}&background=F8BBD0&color=880E4F&size=128`
    );
    const roleLabel = isAdmin ? 'Admin' : 'Student';

    container.innerHTML = `
      <nav class="pts-topnav" data-i18n-aria-label="nav.main" aria-label="${escapeAttr(t('nav.main', 'เมนูหลัก'))}">
        <div class="pts-topnav__inner">
          <div class="pts-topnav__start">
            ${burgerHtml()}
            ${brandHtml()}
          </div>
          <div class="pts-topnav__links">
            <a class="pts-topnav__link" href="Home.html" data-i18n="nav.home">${t('nav.home', 'หน้าแรก')}</a>
            ${coursesMegaHtml()}
            <a class="pts-topnav__link" href="Community.html" data-i18n="nav.community">${t('nav.community', 'คอมมูนิตี้')}</a>
          </div>
          <div class="pts-topnav__actions">
            <a href="Notifications.html" class="pts-topnav__icon" data-i18n-section_title="nav.notifications" data-i18n-aria-label="nav.notifications" section_title="${escapeAttr(t('nav.notifications', 'การแจ้งเตือน'))}" aria-label="${escapeAttr(t('nav.notifications', 'การแจ้งเตือน'))}">🔔</a>
            ${profileMenuHtml(name, roleLabel, avatar, isAdmin)}
            ${langToggleHtml()}
            ${themeToggleHtml()}
          </div>
        </div>
        <div class="pts-topnav__mobile" id="pts-mobile-nav" data-pts-mobile>
          <a href="Home.html" data-i18n="nav.home">${t('nav.home', 'หน้าแรก')}</a>
          ${coursesMobileHtml()}
          <a href="Community.html" data-i18n="nav.community">${t('nav.community', 'คอมมูนิตี้')}</a>
          ${isAdmin
            ? `<a href="Admin.html#courses">${t('nav.admin.courses', 'หลักสูตร')}</a>
               <a href="Admin.html#lessons">${t('nav.admin.lessons', 'บทเรียน')}</a>
               <a href="Admin.html#schedules">${t('nav.admin.schedules', 'ตารางเรียน')}</a>
               <a href="Admin.html#forms">${t('nav.admin.forms', 'แบบฟอร์ม')}</a>
               <a href="Admin.html#banners">${t('nav.admin.banners', 'แบนเนอร์')}</a>
               <a href="Admin.html#cert">${t('nav.admin.cert', 'ใบประกาศ')}</a>
               <a href="Admin.html#users">${t('nav.admin.users', 'ผู้ใช้')}</a>
               <a href="Admin.html#posts">${t('nav.admin.posts', 'โพสต์')}</a>
               <a href="Admin.html#payments">${t('nav.admin.payments', 'ชำระเงิน')}</a>
               <a href="Admin.html#coupons">${t('nav.admin.coupons', 'คูปองส่วนลด')}</a>
               <a href="Admin.html#audit">${t('nav.admin.audit', 'ประวัติแอดมิน')}</a>
               <a href="Admin.html#mail">${t('nav.admin.mail', 'อีเมล OTP')}</a>
               <a href="Settings.html">${t('nav.settings', 'ตั้งค่าโปรไฟล์')}</a>`
            : `<a href="DashbordU.html">${t('nav.dashboard', 'แดชบอร์ด')}</a>
               <a href="MyCourses.html">${t('nav.mycourses', 'หลักสูตรของฉัน')}</a>
               <a href="Payments.html">${t('nav.payments', 'การชำระเงิน')}</a>
               <a href="Forms.html">${t('nav.forms', 'แบบฟอร์ม')}</a>
               <a href="Certificates.html">${t('nav.certificates', 'ใบประกาศ')}</a>
               <a href="Favorites.html">${t('nav.favorites', 'รายการโปรด')}</a>
               <a href="Schedule.html">${t('nav.schedule', 'ตารางเรียน')}</a>
               <a href="Notifications.html">${t('nav.notifications', 'การแจ้งเตือน')}</a>
               <a href="Settings.html">${t('nav.settings', 'ตั้งค่า')}</a>`}
        </div>
      </nav>`;
    bindToggles(container);
    syncThemeToggle(container);
    syncLangToggle(container);
  }

  function refreshNavbarI18n() {
    const container = document.getElementById('app-navbar');
    if (!container || !container.querySelector('.pts-topnav')) {
      checkUserAndRenderNavbar();
      return;
    }
    const mobileOpen = container.querySelector('[data-pts-mobile]')?.classList.contains('is-open');
    const profileOpen = container.querySelector('[data-pts-user-wrap]')?.classList.contains('is-open');
    if (window.PTSLang && typeof window.PTSLang.apply === 'function') {
      window.PTSLang.apply(container);
    }
    syncLangToggle(container);
    syncThemeToggle(container);
    const burger = container.querySelector('[data-pts-burger]');
    if (burger) {
      burger.setAttribute('aria-label', mobileOpen ? t('nav.closeMenu', 'ปิดเมนู') : t('nav.openMenu', 'เปิดเมนู'));
    }
    const userBtn = container.querySelector('[data-pts-user]');
    if (userBtn) {
      userBtn.setAttribute('aria-label', profileOpen ? t('nav.closeAccount', 'ปิดเมนูบัญชี') : t('nav.openAccount', 'เปิดเมนูบัญชี'));
    }
    container.querySelectorAll('[data-pts-lang]').forEach((btn) => {
      const code = btn.getAttribute('data-pts-lang');
      btn.classList.toggle('is-active', (window.PTSLang?.get() || 'th') === code);
    });
  }

  async function checkUserAndRenderNavbar() {
    ensureThemeApi();
    ensureCriticalCss();
    let container = document.getElementById('app-navbar');
    if (!container) {
      container = document.createElement('div');
      container.id = 'app-navbar';
      document.body.insertBefore(container, document.body.firstChild);
    }

    renderGuest(container);

    try {
      const response = await fetch('/api/users/me', { credentials: 'include' });
      const status = await response.json();
      if (status.loggedIn && status.user) {
        renderLoggedIn(container, status.user);
      } else {
        renderGuest(container);
      }
    } catch (error) {
      console.error('navbar error:', error);
      renderGuest(container);
    }
  }

  async function logout() {
    try {
      const response = await fetch('/api/users/logout', {
        method: 'POST',
        credentials: 'include'
      });
      const result = await response.json();
      if (result.success) window.location.href = 'Home.html';
    } catch (error) {
      console.error('logout error:', error);
      window.location.href = 'Home.html';
    }
  }

  window.logout = logout;
  window.checkUserAndRenderNavbar = checkUserAndRenderNavbar;

  document.addEventListener('click', (e) => {
    const megaBtn = e.target.closest('[data-mega-filter]');
    if (megaBtn) {
      const filterType = megaBtn.getAttribute('data-mega-filter') || megaBtn.dataset.megaFilter;
      window.location.href = `Courses.html?filter=${String(filterType).toLowerCase()}`;
      return;
    }

    const root = document.getElementById('app-navbar');
    if (!root) return;
    if (e.target.closest('[data-pts-user-wrap]') || e.target.closest('[data-pts-burger]') || e.target.closest('[data-pts-mobile]')) {
      return;
    }
    closeAllMenus(root);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    closeAllMenus(document.getElementById('app-navbar'));
  });

  function boot() {
    checkUserAndRenderNavbar();
  }

  document.addEventListener('pts-lang-change', () => {
    refreshNavbarI18n();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
