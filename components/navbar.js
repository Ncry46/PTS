const PTS_LOGO = 'https://lh3.googleusercontent.com/aida-public/AB6AXuABTNhK77NiL0IuFIQlI6OT3Vifm8qP13KVh2E7ow7C1nBZBzvCmxbfbPcqp_ufJqTB-yyShP5xCpLknrMb_L-Giu18pK_I31kIyaQ_R7QyIYjEwf6o5aRyjEY_AdnfLq2rmWtA8WnFI9-AaODwblGI-IcbELscflTPE3ViIRI0pz8sPdppAL4lmeCdpzCdbWVJVt8CsBOnK5aNpm5LSEzvcUIMq56MlbLb0noVVSeb7AcP1xu4117jog';

function escapeAttr(t) {
    return String(t || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function brandHtml() {
    return `
      <a class="pts-brand" href="Home.html" aria-label="PTS Learning">
        <span class="pts-brand__mark">PTS</span>
        <span class="pts-brand__text">
          <span class="pts-brand__name">PTS Learning</span>
          <span class="pts-brand__tag">Personal Assistant Academy</span>
        </span>
      </a>`;
}

function courseLinks() {
    return `
      <a class="pts-nav__link" href="Courses.html">หลักสูตร</a>
      <a class="pts-nav__link" href="Courses.html?filter=online">Online</a>
      <a class="pts-nav__link" href="Courses.html?filter=onsite">Onsite</a>
      <a class="pts-nav__link" href="Courses.html?filter=hybrid">Hybrid</a>`;
}

function mobileBlock(extra = '') {
    return `
      <div id="mobile-menu" class="pts-mobile-menu">
        <a href="Home.html">หน้าแรก</a>
        <a href="Courses.html">หลักสูตร</a>
        <a href="Community.html">คอมมูนิตี้</a>
        ${extra}
        <a href="Login.html">เข้าสู่ระบบ</a>
        <a href="Register.html" style="font-weight:700;color:var(--pts-primary)">สมัครสมาชิก</a>
      </div>`;
}

function bindMobileToggle() {
    setTimeout(() => {
        const btn = document.getElementById('mobile-menu-btn');
        const menu = document.getElementById('mobile-menu');
        if (btn && menu) {
            btn.onclick = () => menu.classList.toggle('is-open');
        }
    }, 0);
}

async function checkUserAndRenderNavbar() {
    const container = document.getElementById('app-navbar');
    if (!container) return;

    try {
        const response = await fetch('/api/users/me', { credentials: 'include' });
        const status = await response.json();

        if (!status.loggedIn) {
            container.innerHTML = `
              <nav class="pts-nav">
                <div class="pts-nav__inner">
                  ${brandHtml()}
                  <div class="pts-nav__links">
                    <a class="pts-nav__link" href="Home.html">หน้าแรก</a>
                    <a class="pts-nav__link" href="Courses.html">หลักสูตร</a>
                    <a class="pts-nav__link" href="Community.html">คอมมูนิตี้</a>
                  </div>
                  <div class="pts-nav__actions">
                    <a class="pts-btn pts-btn-outline pts-nav__hide-mobile" href="Login.html">เข้าสู่ระบบ</a>
                    <a class="pts-btn pts-btn-primary pts-nav__hide-mobile" href="Register.html">สมัครสมาชิก</a>
                    <button type="button" id="mobile-menu-btn" class="pts-nav__icon pts-nav__burger" aria-label="เมนู">
                      <span class="material-symbols-outlined">menu</span>
                    </button>
                  </div>
                </div>
                ${mobileBlock()}
              </nav>`;
            bindMobileToggle();
            return;
        }

        const currentUser = status.user;
        const userRole = (currentUser?.role || currentUser?.Role || '').toLowerCase();
        const isAdmin = userRole === 'admin';
        const name = escapeAttr(currentUser.name || 'ผู้ใช้');
        const avatar = escapeAttr(
            currentUser.Url ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(currentUser.name || 'P')}&background=F8BBD0&color=880E4F&size=128`
        );
        const roleLabel = isAdmin ? 'Admin' : 'Student';

        const extraLinks = `
          <a class="pts-nav__link" href="DashbordU.html">แดชบอร์ด</a>
          <a class="pts-nav__link" href="Schedule.html">ตารางเรียน</a>
          <a class="pts-nav__link" href="Community.html">คอมมูนิตี้</a>
          ${isAdmin ? '<a class="pts-nav__link" href="Admin.html">Admin</a>' : ''}`;

        const mobileExtra = `
          <a href="DashbordU.html">แดชบอร์ด</a>
          <a href="Schedule.html">ตารางเรียน</a>
          <a href="Certificates.html">ใบประกาศ</a>
          <a href="Favorites.html">คอร์สโปรด</a>
          <a href="Settings.html">ตั้งค่า</a>
          ${isAdmin ? '<a href="Admin.html">Admin</a>' : ''}
          <button type="button" onclick="logout()" style="display:block;width:100%;text-align:left;padding:11px 8px;border:none;background:transparent;font:inherit;color:#ba1a1a;font-weight:600;cursor:pointer">ออกจากระบบ</button>`;

        container.innerHTML = `
          <nav class="pts-nav">
            <div class="pts-nav__inner">
              ${brandHtml()}
              <div class="pts-nav__links">
                <a class="pts-nav__link" href="Home.html">หน้าแรก</a>
                <a class="pts-nav__link" href="Courses.html">หลักสูตร</a>
                ${extraLinks}
              </div>
              <div class="pts-nav__actions">
                <a href="Notifications.html" class="pts-nav__icon" title="การแจ้งเตือน" aria-label="การแจ้งเตือน">
                  <span class="material-symbols-outlined">notifications</span>
                </a>
                <div class="relative" style="position:relative">
                  <button type="button" class="pts-nav__user" onclick="this.nextElementSibling.classList.toggle('hidden')">
                    <span class="pts-nav__user-meta">
                      <span class="pts-nav__user-name">${name}</span>
                      <span class="pts-nav__user-role">${roleLabel}</span>
                    </span>
                    <img src="${avatar}" alt="">
                  </button>
                  <div class="pts-dropdown hidden">
                    <a href="DashbordU.html">แดชบอร์ด</a>
                    <a href="Certificates.html">ใบประกาศ</a>
                    <a href="Payments.html">ชำระเงิน</a>
                    <a href="Favorites.html">คอร์สโปรด</a>
                    <a href="Liked.html">โพสต์ถูกใจ</a>
                    <a href="Settings.html">ตั้งค่า</a>
                    ${isAdmin ? '<a href="Admin.html">Admin</a>' : ''}
                    <button type="button" class="pts-danger" onclick="logout()">ออกจากระบบ</button>
                  </div>
                </div>
                <button type="button" id="mobile-menu-btn" class="pts-nav__icon pts-nav__burger" aria-label="เมนู">
                  <span class="material-symbols-outlined">menu</span>
                </button>
              </div>
            </div>
            <div id="mobile-menu" class="pts-mobile-menu">
              <a href="Home.html">หน้าแรก</a>
              <a href="Courses.html">หลักสูตร</a>
              <a href="Community.html">คอมมูนิตี้</a>
              ${mobileExtra}
            </div>
          </nav>`;
        bindMobileToggle();
    } catch (error) {
        console.error('navbar error:', error);
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

document.addEventListener('click', (e) => {
    const megaBtn = e.target.closest('[data-mega-filter]');
    if (!megaBtn) return;
    const filterType = megaBtn.getAttribute('data-mega-filter') || megaBtn.dataset.megaFilter;
    window.location.href = `Courses.html?filter=${filterType.toLowerCase()}`;
});

document.addEventListener('DOMContentLoaded', checkUserAndRenderNavbar);
