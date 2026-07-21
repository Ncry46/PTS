(function () {
  const shell = document.getElementById('login-shell');
  if (shell && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const onMove = (e) => {
      if (window.innerWidth < 900) return;
      const rect = shell.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      shell.style.transform = `perspective(1200px) rotateY(${x * 4}deg) rotateX(${-y * 3}deg)`;
    };
    shell.addEventListener('mousemove', onMove);
    shell.addEventListener('mouseleave', () => { shell.style.transform = ''; });
  }

  document.querySelectorAll('.pts-login__control').forEach((wrap) => {
    const input = wrap.querySelector('input');
    const icon = wrap.querySelector(':scope > .pts-login__ico');
    if (!input || !icon) return;
    input.addEventListener('focus', () => { icon.style.color = '#974258'; });
    input.addEventListener('blur', () => { icon.style.color = ''; });
  });

  document.getElementById('google-login-btn')?.addEventListener('click', () => {
    const loginMsg = document.getElementById('login-msg');
    if (!loginMsg) return;
    loginMsg.textContent = 'ขณะนี้เข้าสู่ระบบด้วยอีเมลได้เลย — Gmail OAuth กำลังเตรียมเปิดใช้งาน';
    loginMsg.classList.remove('hidden');
    loginMsg.classList.add('is-info');
  });

  function openResetModal() {
    const modal = document.getElementById('reset-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  function closeResetModal() {
    const modal = document.getElementById('reset-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
    document.getElementById('otp-verification-zone').classList.add('is-locked');
    const confirmBtn = document.getElementById('confirm-reset-btn');
    confirmBtn.disabled = true;
    confirmBtn.classList.add('is-disabled');
    clearResetMsg();
  }

  window.openResetModal = openResetModal;
  window.closeResetModal = closeResetModal;

  document.getElementById('forgot-password-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openResetModal();
  });
  document.getElementById('reset-cancel-btn')?.addEventListener('click', closeResetModal);
  document.getElementById('otp-btn')?.addEventListener('click', () => { requestRealOTP(); });
  document.getElementById('confirm-reset-btn')?.addEventListener('click', () => { submitVerifyAndReset(); });

  function showResetMsg(text, isError = true) {
    const el = document.getElementById('reset-msg');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ba1a1a' : '#974258';
    el.classList.remove('hidden');
  }

  function clearResetMsg() {
    const el = document.getElementById('reset-msg');
    if (el) { el.textContent = ''; el.classList.add('hidden'); }
  }

  async function requestRealOTP() {
    const email = document.getElementById('reset-email').value.trim();
    const otpBtn = document.getElementById('otp-btn');
    clearResetMsg();
    if (!email) {
      showResetMsg('กรุณากรอกอีเมลในระบบก่อนครับ');
      return;
    }
    otpBtn.innerText = 'กำลังส่ง...';
    otpBtn.disabled = true;
    try {
      const response = await fetch('/api/users/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      if (result.success) {
        document.getElementById('otp-verification-zone').classList.remove('is-locked');
        const confirmBtn = document.getElementById('confirm-reset-btn');
        confirmBtn.disabled = false;
        confirmBtn.classList.remove('is-disabled');
        otpBtn.innerText = 'ส่งอีกครั้ง';
      } else {
        showResetMsg(result.message || 'ส่ง OTP ไม่สำเร็จ');
        otpBtn.innerText = 'ขอรหัส OTP';
      }
    } catch (err) {
      console.error(err);
      showResetMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
      otpBtn.innerText = 'ขอรหัส OTP';
    } finally {
      otpBtn.disabled = false;
    }
  }
  window.requestRealOTP = requestRealOTP;

  async function submitVerifyAndReset() {
    const payload = {
      email: document.getElementById('reset-email').value.trim(),
      otp: document.getElementById('reset-otp').value.trim(),
      new_password: document.getElementById('reset-new-password').value
    };
    clearResetMsg();
    if (!payload.otp || !payload.new_password) {
      showResetMsg('กรุณากรอกรหัส OTP 6 หลัก และตั้งรหัสผ่านใหม่');
      return;
    }
    try {
      const response = await fetch('/api/users/verify-otp-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.success) closeResetModal();
      else showResetMsg(result.message || 'ยืนยันไม่สำเร็จ');
    } catch (err) {
      console.error(err);
      showResetMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }
  window.submitVerifyAndReset = submitVerifyAndReset;

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');
    const loginMsg = document.getElementById('login-msg');
    if (loginMsg) {
      loginMsg.textContent = '';
      loginMsg.classList.add('hidden');
      loginMsg.classList.remove('is-info');
    }
    submitBtn.textContent = 'กำลังตรวจสอบข้อมูล...';
    submitBtn.disabled = true;
    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          email: document.getElementById('email').value,
          password: document.getElementById('password').value
        })
      });
      const result = await response.json();
      if (result.success) {
        window.location.href = 'DashbordU.html';
      } else if (loginMsg) {
        loginMsg.textContent = result.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
        loginMsg.classList.remove('hidden');
      }
    } catch (err) {
      console.error(err);
      if (loginMsg) {
        loginMsg.textContent = 'ไม่สามารถติดต่อเซิร์ฟเวอร์ได้';
        loginMsg.classList.remove('hidden');
      }
    } finally {
      submitBtn.innerHTML = 'เข้าสู่ระบบ <span class="material-symbols-outlined pts-login__submit-ico">login</span>';
      submitBtn.disabled = false;
    }
  });
})();
