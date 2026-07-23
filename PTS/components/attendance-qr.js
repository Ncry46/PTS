/* PTS attendance QR — encodes logged-in user email for onsite kiosk scan */
(function () {
  function escapeHtml(t) {
    return String(t || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderQr(target, email) {
    if (!target || !email) return false;
    if (typeof QRCode === 'undefined') {
      target.innerHTML = '<p class="pts-attend-qr__err">โหลดไลบรารี QR ไม่สำเร็จ</p>';
      return false;
    }
    target.innerHTML = '';
    try {
      // eslint-disable-next-line no-new
      new QRCode(target, {
        text: String(email).trim(),
        width: 196,
        height: 196,
        correctLevel: QRCode.CorrectLevel.M
      });
      return true;
    } catch (err) {
      target.innerHTML = '<p class="pts-attend-qr__err">สร้าง QR ไม่สำเร็จ</p>';
      console.error('attendance QR', err);
      return false;
    }
  }

  /**
   * @param {HTMLElement|string} container
   * @param {{ email?: string, name?: string, compact?: boolean }} opts
   */
  function mount(container, opts) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return null;
    const options = opts || {};
    const email = String(options.email || '').trim();
    const name = String(options.name || '').trim();
    const compact = !!options.compact;

    if (!email) {
      el.innerHTML = `
        <div class="pts-attend-qr pts-attend-qr--empty">
          <p>ไม่พบอีเมลในบัญชี — กรุณาเข้าสู่ระบบใหม่</p>
        </div>`;
      return null;
    }

    el.innerHTML = `
      <div class="pts-attend-qr${compact ? ' pts-attend-qr--compact' : ''}">
        <div class="pts-attend-qr__head">
          <span class="pts-attend-qr__chip">
            <span class="material-symbols-outlined" aria-hidden="true">qr_code_2</span>
            Onsite Check-in
          </span>
          <h3 class="pts-attend-qr__title">QR เข้าเรียนออนไซต์</h3>
          <p class="pts-attend-qr__lead">แสดง QR นี้ที่จุดสแกนเมื่อเข้าคลาส Onsite — ระบบใช้เมลที่คุณล็อกอิน</p>
        </div>
        <div class="pts-attend-qr__frame" data-pts-attend-qr-frame></div>
        <div class="pts-attend-qr__meta">
          ${name ? `<p class="pts-attend-qr__name">${escapeHtml(name)}</p>` : ''}
          <p class="pts-attend-qr__email">${escapeHtml(email)}</p>
        </div>
        <p class="pts-attend-qr__hint">อย่าแชร์ QR นี้กับผู้อื่น เพราะใช้ลงเวลาเข้าเรียนแทนคุณได้</p>
      </div>`;

    const frame = el.querySelector('[data-pts-attend-qr-frame]');
    renderQr(frame, email);
    return { email, refresh: () => renderQr(frame, email) };
  }

  window.PtsAttendanceQr = { mount, renderQr };
})();
