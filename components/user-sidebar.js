/**
 * เมนูด้านข้างสำหรับผู้ใช้ (สไตล์เดียวกับแอดมิน)
 * ใส่ <aside id="user-sidebar"></aside> ในหน้า หรือเรียก PTSUserSidebar.mount(el)
 */
(function () {
  const LINKS = [
    { href: 'DashbordU.html', label: 'แดชบอร์ด', match: /DashbordU\.html/i },
    { href: 'MyCourses.html', label: 'หลักสูตรของฉัน', match: /MyCourses\.html/i },
    { href: 'Certificates.html', label: 'ใบประกาศ', match: /Certificates\.html/i },
    { href: 'Payments.html', label: 'ชำระเงิน', match: /Payments\.html/i },
    { href: 'Favorites.html', label: 'รายการโปรด', match: /Favorites\.html/i },
    { href: 'Schedule.html', label: 'ตารางเรียน', match: /Schedule\.html/i },
    { href: 'Notifications.html', label: 'การแจ้งเตือน', match: /Notifications\.html/i },
    { href: 'Settings.html', label: 'ตั้งค่า', match: /Settings\.html/i },
    { href: 'Community.html', label: 'คอมมูนิตี้', match: /Community\.html/i }
  ];

  function currentFile() {
    const path = (location.pathname || '').split('/').pop() || '';
    return path || 'DashbordU.html';
  }

  function isActive(link) {
    const file = currentFile();
    if (link.match.test(file)) return true;
    // แดชบอร์ดเป็นหน้าแรกของโซนผู้ใช้
    if (link.href === 'DashbordU.html' && (!file || file === '' || file === 'index.html')) return true;
    return false;
  }

  function renderHtml() {
    const items = LINKS.map((link) => {
      const active = isActive(link) ? ' is-active' : '';
      return `<a class="user-side__link${active}" href="${link.href}">${link.label}</a>`;
    }).join('');

    return `
      <p class="user-side__label">เมนูของฉัน</p>
      <nav class="user-side__nav" aria-label="เมนูผู้ใช้">
        ${items}
      </nav>`;
  }

  function ensureShell(main) {
    if (!main) return null;
    if (main.querySelector('#user-sidebar')) return main;

    const aside = document.createElement('aside');
    aside.id = 'user-sidebar';
    aside.className = 'user-side';
    aside.setAttribute('aria-label', 'เมนูผู้ใช้');

    const content = document.createElement('div');
    content.className = 'user-main';
    while (main.firstChild) content.appendChild(main.firstChild);

    main.classList.add('pts-main--wide', 'user-shell');
    main.appendChild(aside);
    main.appendChild(content);
    return main;
  }

  function mount(target) {
    let aside = target || document.getElementById('user-sidebar');
    if (!aside) {
      const main = document.querySelector('main[data-user-shell], main.pts-main, main.user-shell-host');
      if (main) {
        ensureShell(main);
        aside = document.getElementById('user-sidebar');
      }
    }
    if (!aside) return;
    aside.classList.add('user-side');
    aside.innerHTML = renderHtml();
  }

  window.PTSUserSidebar = { mount, LINKS, renderHtml };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => mount());
  } else {
    mount();
  }
})();
