/* PTS shared top navigation — self-contained so the header always shows */
(function () {
  const PTS_LOGO =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuABTNhK77NiL0IuFIQlI6OT3Vifm8qP13KVh2E7ow7C1nBZBzvCmxbfbPcqp_ufJqTB-yyShP5xCpLknrMb_L-Giu18pK_I31kIyaQ_R7QyIYjEwf6o5aRyjEY_AdnfLq2rmWtA8WnFI9-AaODwblGI-IcbELscflTPE3ViIRI0pz8sPdppAL4lmeCdpzCdbWVJVt8CsBOnK5aNpm5LSEzvcUIMq56MlbLb0noVVSeb7AcP1xu4117jog';

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

  function themeToggleHtml() {
    return `
      <button type="button" class="pts-theme-toggle" data-pts-theme-toggle
        aria-label="สลับโหมดมืด/สว่าง" title="สลับโหมดมืด/สว่าง">
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
    const label = theme.get() === 'dark' ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.onclick = (e) => {
      e.preventDefault();
      theme.toggle();
      syncThemeToggle(root);
    };
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
        font-family:'IBM Plex Sans Thai',Sarabun,sans-serif;
        color:var(--pts-text,#1c1520);
      }
      .pts-topnav__inner {
        max-width:1120px; margin:0 auto; height:100%; padding:0 16px;
        display:flex; align-items:center; justify-content:space-between; gap:12px;
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
      .pts-topnav__link:hover { background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#974258); }
      .pts-topnav__mega-wrap { position:relative; height:100%; display:flex; align-items:center; }
      .pts-topnav__mega-btn {
        padding:8px 12px; border-radius:999px; border:none; background:transparent; cursor:pointer;
        font:inherit; font-size:14px; font-weight:600; color:var(--pts-muted,#4b3f44); display:inline-flex; align-items:center; gap:4px;
      }
      .pts-topnav__mega-btn:hover, .pts-topnav__mega-wrap:hover .pts-topnav__mega-btn {
        background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#974258);
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
        font-size:12px; font-weight:800; letter-spacing:.02em; background:var(--pts-primary-soft,#f6e6ea); color:var(--pts-primary,#974258);
      }
      .pts-topnav__mega-icon--onsite { background:#eef5ea; color:#4c6548; }
      .pts-topnav__mega-icon--hybrid { background:#e8f6ec; color:#166c39; }
      html[data-theme="dark"] .pts-topnav__mega-icon--onsite { background:rgba(76,101,72,.28); color:#b3ceab; }
      html[data-theme="dark"] .pts-topnav__mega-icon--hybrid { background:rgba(22,108,57,.28); color:#a2f5b4; }
      .pts-topnav__mega-title { font-size:15px; font-weight:700; margin:0 0 2px; }
      .pts-topnav__mega-desc { font-size:13px; color:var(--pts-muted,#6b5c62); margin:0; line-height:1.4; }
      .pts-topnav__mega-foot {
        padding:12px 16px; border-top:1px solid var(--pts-border,rgba(151,66,88,.12));
        background:color-mix(in srgb, var(--pts-surface,#fff) 92%, var(--pts-primary,#974258));
      }
      .pts-topnav__mega-foot a {
        display:flex; align-items:center; justify-content:center; height:40px; border-radius:999px;
        background:var(--pts-primary,#974258); color:#fff; text-decoration:none; font-weight:700; font-size:14px;
      }
      .pts-topnav__actions { display:flex; align-items:center; gap:8px; margin-left:auto; }
      .pts-topnav__btn {
        display:inline-flex; align-items:center; justify-content:center; height:40px; padding:0 16px;
        border-radius:999px; text-decoration:none; font-size:14px; font-weight:700; white-space:nowrap;
      }
      .pts-topnav__btn--ghost {
        border:1px solid color-mix(in srgb, var(--pts-primary,#974258) 35%, transparent);
        color:var(--pts-primary,#974258); background:var(--pts-surface,#fff);
      }
      .pts-topnav__btn--primary { background:var(--pts-primary,#974258); color:#fff; border:none; }
      .pts-topnav__icon {
        width:40px; height:40px; border:none; border-radius:999px; background:transparent;
        color:var(--pts-muted,#5c4f55); display:grid; place-items:center; cursor:pointer; text-decoration:none;
      }
      .pts-topnav__icon:hover { background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#974258); }
      .pts-theme-toggle {
        width:40px; height:40px; border:1px solid var(--pts-border,rgba(151,66,88,.18)); border-radius:999px;
        background:var(--pts-surface,#fff); color:var(--pts-text,#1c1520);
        display:grid; place-items:center; cursor:pointer; flex-shrink:0;
      }
      .pts-theme-toggle:hover {
        background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#974258);
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
      .pts-topnav__burger:hover { background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#974258); }
      .pts-topnav__burger[aria-expanded="true"] {
        background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#974258);
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
        display:none; position:absolute; top:calc(100% + 8px); right:0; z-index:100002;
        width:min(280px, calc(100vw - 24px)); padding:0;
        background:var(--pts-surface,#fff);
        border:1px solid var(--pts-border,rgba(151,66,88,.16));
        border-radius:14px;
        box-shadow:var(--pts-shadow,0 16px 40px rgba(28,21,32,.14));
        overflow:hidden;
      }
      .pts-topnav__user-wrap.is-open .pts-topnav__drop { display:block; }
      .pts-topnav__drop-head {
        display:flex; align-items:center; gap:10px; padding:14px 14px 12px;
        border-bottom:1px solid var(--pts-border,rgba(151,66,88,.12));
        background:linear-gradient(180deg, var(--pts-nav-hover,#faf4f6), var(--pts-surface,#fff));
      }
      .pts-topnav__drop-head img {
        width:40px; height:40px; border-radius:999px; object-fit:cover;
        border:2px solid var(--pts-primary-soft,#f6e6ea); flex-shrink:0;
      }
      .pts-topnav__drop-name { font-size:14px; font-weight:700; color:var(--pts-text,#1c1520); line-height:1.2; }
      .pts-topnav__drop-role {
        font-size:11px; font-weight:700; color:var(--pts-primary,#974258);
        text-transform:uppercase; letter-spacing:.04em; margin-top:2px;
      }
      .pts-topnav__drop-nav { padding:6px; }
      .pts-topnav__drop-nav a, .pts-topnav__drop-nav button {
        display:flex; align-items:center; width:100%; text-align:left; padding:11px 12px;
        border:none; background:transparent; font:inherit; font-size:14px; font-weight:600;
        color:var(--pts-text,#1c1520); text-decoration:none; border-radius:10px; cursor:pointer;
      }
      .pts-topnav__drop-nav a:hover, .pts-topnav__drop-nav button:hover {
        background:var(--pts-nav-hover,#f6e6ea); color:var(--pts-primary,#974258);
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
        aria-label="เปิดเมนู" aria-expanded="false" aria-controls="pts-mobile-nav">☰</button>`;
  }

  function coursesMegaHtml() {
    return `
      <div class="pts-topnav__mega-wrap">
        <button type="button" class="pts-topnav__mega-btn" aria-haspopup="true">
          หลักสูตร <span aria-hidden="true">▾</span>
        </button>
        <div class="pts-topnav__mega" role="menu">
          <div class="pts-topnav__mega-panel">
            <button type="button" class="pts-topnav__mega-item" data-mega-filter="online">
              <span class="pts-topnav__mega-icon">On</span>
              <span>
                <p class="pts-topnav__mega-title">Online</p>
                <p class="pts-topnav__mega-desc">เรียนผ่านเว็บไซต์ เรียนได้ทุกที่ ทุกเวลา</p>
              </span>
            </button>
            <button type="button" class="pts-topnav__mega-item" data-mega-filter="onsite">
              <span class="pts-topnav__mega-icon pts-topnav__mega-icon--onsite">Os</span>
              <span>
                <p class="pts-topnav__mega-title">Onsite</p>
                <p class="pts-topnav__mega-desc">เรียนที่ PTS Academy พร้อมเช็กอินผ่าน QR Code</p>
              </span>
            </button>
            <button type="button" class="pts-topnav__mega-item" data-mega-filter="hybrid">
              <span class="pts-topnav__mega-icon pts-topnav__mega-icon--hybrid">Hy</span>
              <span>
                <p class="pts-topnav__mega-title">Hybrid</p>
                <p class="pts-topnav__mega-desc">เรียนทั้งออนไลน์และออนไซต์ในหลักสูตรเดียว</p>
              </span>
            </button>
            <div class="pts-topnav__mega-foot">
              <a href="Courses.html">ดูหลักสูตรทั้งหมด</a>
            </div>
          </div>
        </div>
      </div>`;
  }

  function coursesMobileHtml() {
    return `
      <a href="Courses.html">หลักสูตรทั้งหมด</a>
      <a href="Courses.html?filter=online">· Online</a>
      <a href="Courses.html?filter=onsite">· Onsite</a>
      <a href="Courses.html?filter=hybrid">· Hybrid</a>`;
  }

  function profileMenuHtml(name, roleLabel, avatar, isAdmin) {
    const studentLinks = `
          <a href="DashbordU.html" role="menuitem">แดชบอร์ด</a>
          <a href="Certificates.html" role="menuitem">ใบประกาศ</a>
          <a href="Payments.html" role="menuitem">ชำระเงิน</a>
          <a href="Favorites.html" role="menuitem">รายการโปรด</a>
          <a href="Schedule.html" role="menuitem">ตารางเรียน / QR Onsite</a>
          <a href="Settings.html" role="menuitem">ตั้งค่า</a>`;

    const adminLinks = `
          <a href="Admin.html#lessons" role="menuitem">บทเรียน</a>
          <a href="Admin.html#schedules" role="menuitem">ตารางเรียน</a>
          <a href="Admin.html#banners" role="menuitem">แบนเนอร์</a>
          <a href="Admin.html#users" role="menuitem">ผู้ใช้</a>
          <a href="Admin.html#posts" role="menuitem">โพสต์</a>
          <a href="Admin.html#payments" role="menuitem">ชำระเงิน</a>
          <a href="Admin.html#mail" role="menuitem">อีเมล OTP</a>`;

    return `
      <div class="pts-topnav__user-wrap" data-pts-user-wrap>
        <button type="button" class="pts-topnav__user" data-pts-user
          aria-label="เปิดเมนูบัญชี" aria-expanded="false" aria-haspopup="true" aria-controls="pts-user-menu">
          <span style="display:none;text-align:right;line-height:1.15" class="pts-topnav__user-meta">
            <span style="display:block;font-size:13px;font-weight:700">${name}</span>
            <span style="display:block;font-size:10px;font-weight:700;color:var(--pts-primary,#974258);text-transform:uppercase">${roleLabel}</span>
          </span>
          <img src="${avatar}" alt="">
        </button>
        <div class="pts-topnav__drop" id="pts-user-menu" data-pts-user-drop role="menu" hidden>
          <div class="pts-topnav__drop-head">
            <img src="${avatar}" alt="">
            <div>
              <div class="pts-topnav__drop-name">${name}</div>
              <div class="pts-topnav__drop-role">${roleLabel}</div>
            </div>
          </div>
          <nav class="pts-topnav__drop-nav">
            ${isAdmin ? adminLinks : studentLinks}
            <button type="button" class="pts-topnav__drop-logout" role="menuitem" onclick="logout()">ออกจากระบบ</button>
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
    burger.setAttribute('aria-label', open ? 'ปิดเมนู' : 'เปิดเมนู');
  }

  function setProfileOpen(wrap, open) {
    if (!wrap) return;
    const btn = wrap.querySelector('[data-pts-user]');
    const drop = wrap.querySelector('[data-pts-user-drop]');
    wrap.classList.toggle('is-open', open);
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'ปิดเมนูบัญชี' : 'เปิดเมนูบัญชี');
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
      <nav class="pts-topnav" aria-label="เมนูหลัก">
        <div class="pts-topnav__inner">
          <div class="pts-topnav__start">
            ${burgerHtml()}
            ${brandHtml()}
          </div>
          <div class="pts-topnav__links">
            <a class="pts-topnav__link" href="Home.html">หน้าแรก</a>
            ${coursesMegaHtml()}
            <a class="pts-topnav__link" href="Community.html">คอมมูนิตี้</a>
          </div>
          <div class="pts-topnav__actions">
            <a class="pts-topnav__btn pts-topnav__btn--ghost pts-topnav__btn--desktop" href="Login.html">เข้าสู่ระบบ</a>
            <a class="pts-topnav__btn pts-topnav__btn--primary pts-topnav__btn--desktop" href="Register.html">สมัครสมาชิก</a>
            ${themeToggleHtml()}
          </div>
        </div>
        <div class="pts-topnav__mobile" id="pts-mobile-nav" data-pts-mobile>
          <a href="Home.html">หน้าแรก</a>
          ${coursesMobileHtml()}
          <a href="Community.html">คอมมูนิตี้</a>
          <a href="Login.html">เข้าสู่ระบบ</a>
          <a href="Register.html" style="color:#974258;font-weight:700">สมัครสมาชิก</a>
        </div>
      </nav>`;
    bindToggles(container);
    syncThemeToggle(container);
  }

  function renderLoggedIn(container, user) {
    const userRole = String(user.role || user.Role || '').toLowerCase();
    const isAdmin = userRole === 'admin';
    const name = escapeAttr(user.name || 'ผู้ใช้');
    const avatar = escapeAttr(
      user.Url ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'P')}&background=F8BBD0&color=880E4F&size=128`
    );
    const roleLabel = isAdmin ? 'Admin' : 'Student';

    container.innerHTML = `
      <nav class="pts-topnav" aria-label="เมนูหลัก">
        <div class="pts-topnav__inner">
          <div class="pts-topnav__start">
            ${burgerHtml()}
            ${brandHtml()}
          </div>
          <div class="pts-topnav__links">
            <a class="pts-topnav__link" href="Home.html">หน้าแรก</a>
            ${coursesMegaHtml()}
            <a class="pts-topnav__link" href="Community.html">คอมมูนิตี้</a>
          </div>
          <div class="pts-topnav__actions">
            <a href="Notifications.html" class="pts-topnav__icon" title="การแจ้งเตือน" aria-label="การแจ้งเตือน">🔔</a>
            ${profileMenuHtml(name, roleLabel, avatar, isAdmin)}
            ${themeToggleHtml()}
          </div>
        </div>
        <div class="pts-topnav__mobile" id="pts-mobile-nav" data-pts-mobile>
          <a href="Home.html">หน้าแรก</a>
          ${coursesMobileHtml()}
          <a href="Community.html">คอมมูนิตี้</a>
        </div>
      </nav>`;
    bindToggles(container);
    syncThemeToggle(container);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
