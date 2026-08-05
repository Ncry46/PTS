(function () {
  const form = document.getElementById('register-form');
  if (!form) return;

  document.getElementById('google-register-btn')?.addEventListener('click', async () => {
    const msgEl = document.getElementById('register-msg');
    const btn = document.getElementById('google-register-btn');
    if (msgEl) {
      msgEl.textContent = '';
      msgEl.classList.add('hidden');
    }
    if (btn) {
      btn.disabled = true;
      btn.dataset.label = btn.dataset.label || btn.textContent;
      btn.textContent = 'กำลังเปิด Google...';
    }
    try {
      const res = await fetch('/api/auth/google/status');
      const status = await res.json().catch(() => ({}));
      if (!status.configured) {
        throw new Error('ยังไม่ได้ตั้งค่า Google OAuth — ใส่ Client ID/Secret ใน backend/google.local.js หรือไฟล์ .env');
      }
      window.location.href = '/api/auth/google/start';
    } catch (err) {
      if (msgEl) {
        msgEl.textContent = err.message || 'เปิด Gmail ไม่สำเร็จ';
        msgEl.classList.remove('hidden');
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.label || 'เข้าสู่ระบบด้วย Gmail';
      }
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-confirm-password').value;
    const tosChecked = document.getElementById('tos').checked;
    const msgEl = document.getElementById('register-msg');
    const showMsg = (text) => {
      if (!msgEl) return;
      msgEl.textContent = text;
      msgEl.classList.remove('hidden');
    };
    if (msgEl) {
      msgEl.textContent = '';
      msgEl.classList.add('hidden');
    }

    if (password !== confirmPassword) {
      showMsg('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง');
      return;
    }
    if (!tosChecked) {
      showMsg('กรุณากดเลือกยอมรับเงื่อนไขการใช้งานก่อนสมัครสมาชิก');
      return;
    }

    const btn = document.getElementById('register-submit-btn');
    const label = btn?.querySelector('span:not(.material-symbols-outlined)');
    const originalText = label ? label.textContent : btn?.textContent;
    if (label) label.textContent = 'กำลังดำเนินการ...';
    else if (btn) btn.textContent = 'กำลังดำเนินการ...';
    if (btn) btn.disabled = true;

    try {
      const response = await fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: document.getElementById('reg-fullname').value,
          email: document.getElementById('reg-email').value,
          phone: document.getElementById('reg-phone').value,
          password
        })
      });
      const result = await response.json();
      if (result.success) {
        if (typeof window.ptsAuthSetMode === 'function') {
          window.ptsAuthSetMode('login');
        }
        const loginMsg = document.getElementById('login-msg');
        if (loginMsg) {
          loginMsg.textContent = 'สมัครสมาชิกสำเร็จ — กรุณาเข้าสู่ระบบ';
          loginMsg.classList.remove('hidden');
          loginMsg.classList.add('is-info');
        }
        const emailInput = document.getElementById('email');
        if (emailInput) emailInput.value = document.getElementById('reg-email').value;
        form.reset();
      } else {
        showMsg(result.message || 'สมัครสมาชิกไม่สำเร็จ');
      }
    } catch (err) {
      console.error(err);
      showMsg('ไม่สามารถติดต่อระบบหลังบ้านได้');
    } finally {
      if (label) label.textContent = originalText;
      else if (btn) {
        btn.innerHTML = 'สมัครสมาชิก <span class="material-symbols-outlined pts-login__submit-ico">person_add</span>';
      }
      if (btn) btn.disabled = false;
    }
  });
})();
