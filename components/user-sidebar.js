/**
 * เมนูด้านข้างสำหรับผู้ใช้ (สไตล์เดียวกับแอดมิน)
 * แสดงเฉพาะเมื่อล็อกอินแล้ว — และไม่ใช้บนหน้า Community
 * ใส่ <main data-user-shell> หรือ <aside id="user-sidebar">
 */
(function () {
  function t(key, fallback) {
    if (window.PTSLang && typeof window.PTSLang.t === 'function') {
      return window.PTSLang.t(key, fallback);
    }
    return fallback != null ? fallback : key;
  }

  function currentFile() {
    const path = (location.pathname || '').split('/').pop() || '';
    return path || 'DashbordU.html';
  }

  function isCommunityPage() {
    return /Community\.html/i.test(currentFile());
  }

  function getLinks() {
    return [
      { href: 'DashbordU.html', labelKey: 'side.dashboard', label: 'แดชบอร์ด', match: /DashbordU\.html/i },
      { href: 'MyCourses.html', labelKey: 'side.mycourses', label: 'หลักสูตรของฉัน', match: /MyCourses\.html/i },
      { href: 'Certificates.html', labelKey: 'side.certificates', label: 'ใบประกาศ', match: /Certificates\.html/i },
      { href: 'Favorites.html', labelKey: 'side.favorites', label: 'รายการโปรด', match: /Favorites\.html/i },
      { href: 'Schedule.html', labelKey: 'side.schedule', label: 'ตารางเรียน', match: /Schedule\.html/i },
      { href: 'Notifications.html', labelKey: 'side.notifications', label: 'การแจ้งเตือน', match: /Notifications\.html/i },
      { href: 'Settings.html', labelKey: 'side.settings', label: 'ตั้งค่า', match: /Settings\.html/i }
    ];
  }

  function isActive(link) {
    const file = currentFile();
    if (link.match.test(file)) return true;
    if (link.href === 'DashbordU.html' && (!file || file === '' || file === 'index.html')) return true;
    return false;
  }

  function renderHtml() {
    const items = getLinks().map((link) => {
      const active = isActive(link) ? ' is-active' : '';
      const label = t(link.labelKey, link.label);
      return `<a class="user-side__link${active}" href="${link.href}">${label}</a>`;
    }).join('');

    return `
      <p class="user-side__label">${t('side.label', 'เมนูของฉัน')}</p>
      <nav class="user-side__nav" aria-label="${t('side.aria', 'เมนูผู้ใช้')}">
        ${items}
      </nav>`;
  }

  function ensureShell(main) {
    if (!main) return null;
    if (main.querySelector('#user-sidebar')) return main;

    const aside = document.createElement('aside');
    aside.id = 'user-sidebar';
    aside.className = 'user-side';
    aside.setAttribute('aria-label', t('side.aria', 'เมนูผู้ใช้'));

    const content = document.createElement('div');
    content.className = 'user-main';
    while (main.firstChild) content.appendChild(main.firstChild);

    main.classList.add('pts-main--user', 'user-shell');
    main.classList.remove('pts-main--wide');
    main.appendChild(aside);
    main.appendChild(content);
    return main;
  }

  function teardownShell() {
    const aside = document.getElementById('user-sidebar');
    const main = document.querySelector('main.user-shell, main.pts-main--user, main[data-user-shell]');
    if (aside) aside.remove();
    if (!main) return;
    const content = main.querySelector('.user-main');
    if (content) {
      while (content.firstChild) main.appendChild(content.firstChild);
      content.remove();
    }
    main.classList.remove('pts-main--user', 'user-shell');
  }

  async function isLoggedIn() {
    try {
      const res = await fetch('/api/users/me', { credentials: 'include' });
      const data = await res.json();
      return !!(data && data.loggedIn);
    } catch (_) {
      return false;
    }
  }

  async function mount(target) {
    // ไม่โชว์แท็บข้างบนหน้าคอมมูนิตี้ หรือเมื่อยังไม่ล็อกอิน
    if (isCommunityPage()) {
      teardownShell();
      return;
    }

    const loggedIn = await isLoggedIn();
    if (!loggedIn) {
      teardownShell();
      return;
    }

    let aside = target || document.getElementById('user-sidebar');
    if (!aside) {
      // เฉพาะหน้าที่ตั้งใจให้มี sidebar — ห้ามเกาะ main.pts-main ทั่วไป
      const main = document.querySelector('main[data-user-shell], main.user-shell-host');
      if (main) {
        ensureShell(main);
        aside = document.getElementById('user-sidebar');
      }
    }
    if (!aside) return;
    aside.classList.add('user-side');
    aside.setAttribute('aria-label', t('side.aria', 'เมนูผู้ใช้'));
    aside.innerHTML = renderHtml();
  }

  window.PTSUserSidebar = { mount, get LINKS() { return getLinks(); }, renderHtml };

  document.addEventListener('pts-lang-change', () => { mount(); });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { mount(); });
  } else {
    mount();
  }
})();
