/* PTS shared top navigation — self-contained so the header always shows */
(function () {
  const PTS_LOGO =
    'https://lh3.googleusercontent.com/aida-public/AB6AXuABTNhK77NiL0IuFIQlI6OT3Vifm8qP13KVh2E7ow7C1nBZBzvCmxbfbPcqp_ufJqTB-yyShP5xCpLknrMb_L-Giu18pK_I31kIyaQ_R7QyIYjEwf6o5aRyjEY_AdnfLq2rmWtA8WnFI9-AaODwblGI-IcbELscflTPE3ViIRI0pz8sPdppAL4lmeCdpzCdbWVJVt8CsBOnK5aNpm5LSEzvcUIMq56MlbLb0noVVSeb7AcP1xu4117jog';

  function escapeAttr(t) {
    return String(t || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  function ensureCriticalCss() {
    if (document.getElementById('pts-nav-critical')) return;
    const style = document.createElement('style');
    style.id = 'pts-nav-critical';
    style.textContent = `
      #app-navbar { display:block !important; min-height:68px; }
      .pts-topnav {
        position:fixed !important; top:0; left:0; right:0; z-index:99999 !important;
        height:68px; background:#fff !important; border-bottom:1px solid rgba(151,66,88,.18);
        box-shadow:0 2px 12px rgba(28,21,32,.06); font-family:'IBM Plex Sans Thai',Sarabun,sans-serif;
      }
      .pts-topnav__inner {
        max-width:1120px; margin:0 auto; height:100%; padding:0 16px;
        display:flex; align-items:center; justify-content:space-between; gap:12px;
      }
      .pts-topnav__brand { display:flex; align-items:center; gap:10px; text-decoration:none; color:#1c1520; flex-shrink:0; }
      .pts-topnav__logo { height:42px; width:auto; max-width:160px; object-fit:contain; display:block; }
      .pts-topnav__mark { display:none !important; }
      .pts-topnav__name { font-weight:700; font-size:15px; line-height:1.15; color:#1c1520; }
      .pts-topnav__tag { font-size:11px; color:#6b5c62; font-weight:500; }
      .pts-topnav__links { display:none; align-items:center; gap:6px; }
      .pts-topnav__link {
        padding:8px 12px; border-radius:999px; text-decoration:none; color:#4b3f44;
        font-size:14px; font-weight:600;
      }
      .pts-topnav__link:hover { background:#f6e6ea; color:#974258; }
      .pts-topnav__mega-wrap { position:relative; height:100%; display:flex; align-items:center; }
      .pts-topnav__mega-btn {
        padding:8px 12px; border-radius:999px; border:none; background:transparent; cursor:pointer;
        font:inherit; font-size:14px; font-weight:600; color:#4b3f44; display:inline-flex; align-items:center; gap:4px;
      }
      .pts-topnav__mega-btn:hover, .pts-topnav__mega-wrap:hover .pts-topnav__mega-btn {
        background:#f6e6ea; color:#974258;
      }
      .pts-topnav__mega {
        display:none; position:absolute; top:100%; left:0; width:420px; padding-top:8px; z-index:100001;
      }
      .pts-topnav__mega-wrap:hover .pts-topnav__mega,
      .pts-topnav__mega-wrap:focus-within .pts-topnav__mega { display:block; }
      .pts-topnav__mega-panel {
        background:#fff; border:1px solid rgba(151,66,88,.16); border-radius:16px;
        box-shadow:0 16px 40px rgba(28,21,32,.12); overflow:hidden;
      }
      .pts-topnav__mega-item {
        display:flex; gap:12px; align-items:flex-start; width:100%; text-align:left; padding:14px 16px;
        border:none; background:transparent; cursor:pointer; font:inherit; color:#1c1520;
      }
      .pts-topnav__mega-item:hover { background:#faf4f6; }
      .pts-topnav__mega-icon {
        width:40px; height:40px; border-radius:999px; display:grid; place-items:center; flex-shrink:0;
        font-size:12px; font-weight:800; letter-spacing:.02em; background:#f6e6ea; color:#974258;
      }
      .pts-topnav__mega-icon--onsite { background:#eef5ea; color:#4c6548; }
      .pts-topnav__mega-icon--hybrid { background:#e8f6ec; color:#166c39; }
      .pts-topnav__mega-title { font-size:15px; font-weight:700; margin:0 0 2px; }
      .pts-topnav__mega-desc { font-size:13px; color:#6b5c62; margin:0; line-height:1.4; }
      .pts-topnav__mega-foot {
        padding:12px 16px; border-top:1px solid rgba(151,66,88,.12); background:#faf7f8;
      }
      .pts-topnav__mega-foot a {
        display:flex; align-items:center; justify-content:center; height:40px; border-radius:999px;
        background:#974258; color:#fff; text-decoration:none; font-weight:700; font-size:14px;
      }
      .pts-topnav__actions { display:flex; align-items:center; gap:8px; }
      .pts-topnav__btn {
        display:inline-flex; align-items:center; justify-content:center; height:40px; padding:0 16px;
        border-radius:999px; text-decoration:none; font-size:14px; font-weight:700; white-space:nowrap;
      }
      .pts-topnav__btn--ghost { border:1px solid rgba(151,66,88,.28); color:#974258; background:#fff; }
      .pts-topnav__btn--primary { background:#974258; color:#fff; border:none; }
      .pts-topnav__icon {
        width:40px; height:40px; border:none; border-radius:999px; background:transparent;
        color:#5c4f55; display:grid; place-items:center; cursor:pointer; text-decoration:none;
      }
      .pts-topnav__burger { display:grid; }
      .pts-topnav__mobile {
        display:none; border-top:1px solid rgba(151,66,88,.14); background:#fff; padding:8px 16px 14px;
      }
      .pts-topnav__mobile.is-open { display:block; }
      .pts-topnav__mobile a, .pts-topnav__mobile button {
        display:block; width:100%; text-align:left; padding:12px 8px; border:none; background:transparent;
        font:inherit; font-weight:600; color:#1c1520; text-decoration:none; border-radius:10px; cursor:pointer;
      }
      .pts-topnav__user { display:flex; align-items:center; gap:8px; border:none; background:transparent; cursor:pointer; padding:4px; }
      .pts-topnav__user img { width:36px; height:36px; border-radius:999px; object-fit:cover; border:2px solid #f6e6ea; }
      .pts-topnav__drop {
        position:absolute; right:0; top:calc(100% + 8px); width:210px; background:#fff;
        border:1px solid rgba(151,66,88,.14); border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.08);
        overflow:hidden; z-index:100000; display:none;
      }
      .pts-topnav__drop.is-open { display:block; }
      .pts-topnav__drop a, .pts-topnav__drop button {
        display:block; width:100%; text-align:left; padding:12px 14px; border:none; background:transparent;
        font:inherit; font-size:14px; color:#1c1520; text-decoration:none; cursor:pointer;
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

  function bindToggles(root) {
    const burger = root.querySelector('[data-pts-burger]');
    const mobile = root.querySelector('[data-pts-mobile]');
    if (burger && mobile) {
      burger.onclick = () => mobile.classList.toggle('is-open');
    }
    const userBtn = root.querySelector('[data-pts-user]');
    const drop = root.querySelector('[data-pts-drop]');
    if (userBtn && drop) {
      userBtn.onclick = (e) => {
        e.stopPropagation();
        drop.classList.toggle('is-open');
      };
    }
  }

  function renderGuest(container) {
    container.innerHTML = `
      <nav class="pts-topnav" aria-label="เมนูหลัก">
        <div class="pts-topnav__inner">
          ${brandHtml()}
          <div class="pts-topnav__links">
            <a class="pts-topnav__link" href="Home.html">หน้าแรก</a>
            ${coursesMegaHtml()}
            <a class="pts-topnav__link" href="Community.html">คอมมูนิตี้</a>
          </div>
          <div class="pts-topnav__actions">
            <a class="pts-topnav__btn pts-topnav__btn--ghost pts-topnav__btn--desktop" href="Login.html">เข้าสู่ระบบ</a>
            <a class="pts-topnav__btn pts-topnav__btn--primary pts-topnav__btn--desktop" href="Register.html">สมัครสมาชิก</a>
            <button type="button" class="pts-topnav__icon pts-topnav__burger" data-pts-burger aria-label="เมนู">☰</button>
          </div>
        </div>
        <div class="pts-topnav__mobile" data-pts-mobile>
          <a href="Home.html">หน้าแรก</a>
          ${coursesMobileHtml()}
          <a href="Community.html">คอมมูนิตี้</a>
          <a href="Login.html">เข้าสู่ระบบ</a>
          <a href="Register.html" style="color:#974258;font-weight:700">สมัครสมาชิก</a>
        </div>
      </nav>`;
    bindToggles(container);
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
          ${brandHtml()}
          <div class="pts-topnav__links">
            <a class="pts-topnav__link" href="Home.html">หน้าแรก</a>
            ${coursesMegaHtml()}
            <a class="pts-topnav__link" href="Community.html">คอมมูนิตี้</a>
            ${isAdmin ? '<a class="pts-topnav__link" href="Admin.html">Admin</a>' : ''}
          </div>
          <div class="pts-topnav__actions">
            <a href="Notifications.html" class="pts-topnav__icon" title="การแจ้งเตือน" aria-label="การแจ้งเตือน">🔔</a>
            <div style="position:relative">
              <button type="button" class="pts-topnav__user" data-pts-user>
                <span style="display:none;text-align:right;line-height:1.15" class="pts-topnav__user-meta">
                  <span style="display:block;font-size:13px;font-weight:700">${name}</span>
                  <span style="display:block;font-size:10px;font-weight:700;color:#974258;text-transform:uppercase">${roleLabel}</span>
                </span>
                <img src="${avatar}" alt="">
              </button>
              <div class="pts-topnav__drop" data-pts-drop>
                <a href="DashbordU.html">แดชบอร์ด</a>
                <a href="Certificates.html">ใบประกาศ</a>
                <a href="Payments.html">ชำระเงิน</a>
                <a href="Favorites.html">คอร์สโปรด</a>
                <a href="Liked.html">โพสต์ถูกใจ</a>
                <a href="Settings.html">ตั้งค่า</a>
                ${isAdmin ? '<a href="Admin.html">Admin</a>' : ''}
                <button type="button" onclick="logout()" style="color:#ba1a1a;font-weight:700">ออกจากระบบ</button>
              </div>
            </div>
            <button type="button" class="pts-topnav__icon pts-topnav__burger" data-pts-burger aria-label="เมนู">☰</button>
          </div>
        </div>
        <div class="pts-topnav__mobile" data-pts-mobile>
          <a href="Home.html">หน้าแรก</a>
          ${coursesMobileHtml()}
          <a href="Community.html">คอมมูนิตี้</a>
          <a href="DashbordU.html">แดชบอร์ด</a>
          <a href="Schedule.html">ตารางเรียน</a>
          <a href="Certificates.html">ใบประกาศ</a>
          <a href="Favorites.html">คอร์สโปรด</a>
          <a href="Settings.html">ตั้งค่า</a>
          ${isAdmin ? '<a href="Admin.html">Admin</a>' : ''}
          <button type="button" onclick="logout()" style="color:#ba1a1a">ออกจากระบบ</button>
        </div>
      </nav>`;
    bindToggles(container);
  }

  async function checkUserAndRenderNavbar() {
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
    if (!confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) return;
    try {
      const response = await fetch('/api/users/logout', {
        method: 'POST',
        credentials: 'include'
      });
      const result = await response.json();
      if (result.success) window.location.href = 'Home.html';
    } catch (error) {
      alert('เกิดข้อผิดพลาดในการออกจากระบบ');
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
    if (!e.target.closest('[data-pts-user]') && !e.target.closest('[data-pts-drop]')) {
      document.querySelectorAll('[data-pts-drop].is-open').forEach((el) => el.classList.remove('is-open'));
    }
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
