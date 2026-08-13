(function () {
  const shell = document.getElementById('login-shell');
  if (
    shell &&
    !shell.classList.contains('pts-login__shell--split') &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
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
    input.addEventListener('focus', () => { icon.style.color = '#ca1156'; });
    input.addEventListener('blur', () => { icon.style.color = ''; });
  });

  document.getElementById('google-login-btn')?.addEventListener('click', async () => {
    const loginMsg = document.getElementById('login-msg');
    const btn = document.getElementById('google-login-btn');
    if (loginMsg) {
      loginMsg.textContent = '';
      loginMsg.classList.add('hidden');
      loginMsg.classList.remove('is-info');
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
      const next = new URLSearchParams(location.search).get('next') || '';
      const safeNext = next && /^[A-Za-z0-9._\-/?#%=]+$/.test(next) && !next.includes('://')
        ? next
        : '';
      window.location.href = safeNext
        ? '/api/auth/google/start?next=' + encodeURIComponent(safeNext)
        : '/api/auth/google/start';
    } catch (err) {
      if (loginMsg) {
        loginMsg.textContent = err.message || 'เปิด Gmail Login ไม่สำเร็จ';
        loginMsg.classList.remove('hidden');
        loginMsg.classList.remove('is-info');
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = btn.dataset.label || 'เข้าสู่ระบบด้วย Gmail';
      }
    }
  });

  // แสดงข้อความ error จาก callback (?google=error&msg=...)
  (function showGoogleCallbackMsg() {
    const params = new URLSearchParams(location.search);
    if (params.get('google') !== 'error') return;
    const loginMsg = document.getElementById('login-msg');
    if (!loginMsg) return;
    loginMsg.textContent = params.get('msg') || 'เข้าสู่ระบบด้วย Gmail ไม่สำเร็จ';
    loginMsg.classList.remove('hidden');
    loginMsg.classList.remove('is-info');
    history.replaceState(null, '', location.pathname);
  })();

  (function showResetOkMsg() {
    const params = new URLSearchParams(location.search);
    if (params.get('reset') !== 'ok') return;
    const loginMsg = document.getElementById('login-msg');
    if (!loginMsg) return;
    loginMsg.textContent = 'ตั้งรหัสผ่านใหม่แล้ว กรุณาเข้าสู่ระบบด้วยรหัสผ่านใหม่';
    loginMsg.classList.remove('hidden');
    loginMsg.classList.add('is-info');
    history.replaceState(null, '', location.pathname + (location.hash || ''));
  })();

  function setResetStep(step) {
    document.querySelectorAll('[data-reset-step]').forEach((el) => {
      const n = Number(el.getAttribute('data-reset-step'));
      el.classList.toggle('is-on', n === step);
      el.classList.toggle('is-done', n < step);
    });
  }

  function openResetModal() {
    const modal = document.getElementById('reset-modal');
    if (!modal) {
      console.error('reset-modal not found');
      return;
    }
    // keep overlay on <body> so fixed centering is never trapped by page layout
    if (modal.parentElement !== document.body) {
      document.body.appendChild(modal);
    }
    const loginEmail = document.getElementById('email');
    const resetEmail = document.getElementById('reset-email');
    if (loginEmail && resetEmail && loginEmail.value && !resetEmail.value) {
      resetEmail.value = loginEmail.value.trim();
    }
    setResetStep(1);
    modal.classList.remove('hidden', 'is-closing', 'is-open');
    void modal.offsetWidth;
    modal.classList.add('is-open');
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    window.scrollTo(0, 0);
    clearResetMsg();
    const sendBtn = document.getElementById('otp-btn');
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = 'ส่งลิงก์ไปที่อีเมล';
    }
    window.setTimeout(() => {
      (resetEmail || modal.querySelector('input'))?.focus({ preventScroll: true });
    }, 380);
  }

  function finishCloseResetModal(modal) {
    modal.classList.add('hidden');
    modal.classList.remove('is-open', 'is-closing');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setResetStep(1);
    clearResetMsg();
  }

  function closeResetModal() {
    const modal = document.getElementById('reset-modal');
    if (!modal || modal.classList.contains('hidden')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      finishCloseResetModal(modal);
      return;
    }
    modal.classList.add('is-closing');
    modal.classList.remove('is-open');
    window.setTimeout(() => finishCloseResetModal(modal), 280);
  }

  window.openResetModal = openResetModal;
  window.closeResetModal = closeResetModal;

  function bindForgotPassword() {
    const btn = document.getElementById('forgot-password-btn');
    if (!btn || btn.dataset.boundForgot === '1') return;
    btn.dataset.boundForgot = '1';
    btn.disabled = false;
    btn.removeAttribute('disabled');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openResetModal();
    });
  }
  bindForgotPassword();
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#forgot-password-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openResetModal();
  });
  document.getElementById('reset-cancel-btn')?.addEventListener('click', closeResetModal);
  document.getElementById('reset-close-btn')?.addEventListener('click', closeResetModal);
  document.getElementById('reset-modal')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeResetModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('reset-modal');
    if (modal && modal.classList.contains('is-open')) closeResetModal();
  });
  document.getElementById('otp-btn')?.addEventListener('click', () => { requestResetLink(); });

  function showResetMsg(text, isError = true) {
    const el = document.getElementById('reset-msg');
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ba1a1a' : '#ca1156';
    el.classList.remove('hidden');
  }

  function clearResetMsg() {
    const el = document.getElementById('reset-msg');
    if (el) { el.textContent = ''; el.classList.add('hidden'); }
  }

  async function requestResetLink() {
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
      const response = await fetch('/api/users/request-reset-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const result = await response.json();
      if (result.success) {
        setResetStep(2);
        showResetMsg(result.message || 'ส่งลิงก์ไปที่อีเมลแล้ว — เปิดเมลแล้วกดปุ่มตั้งรหัสผ่านใหม่', false);
        otpBtn.innerText = 'ส่งลิงก์อีกครั้ง';
      } else {
        showResetMsg(result.message || 'ส่งลิงก์ไม่สำเร็จ');
        otpBtn.innerText = 'ส่งลิงก์ไปที่อีเมล';
      }
    } catch (err) {
      console.error(err);
      showResetMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
      otpBtn.innerText = 'ส่งลิงก์ไปที่อีเมล';
    } finally {
      otpBtn.disabled = false;
    }
  }
  window.requestResetLink = requestResetLink;
  window.requestRealOTP = requestResetLink;

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('login-submit-btn') || document.getElementById('submit-btn');
    const loginMsg = document.getElementById('login-msg');
    if (loginMsg) {
      loginMsg.textContent = '';
      loginMsg.classList.add('hidden');
      loginMsg.classList.remove('is-info');
    }
    if (submitBtn) {
      submitBtn.textContent = 'กำลังตรวจสอบข้อมูล...';
      submitBtn.disabled = true;
    }
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
        const next = new URLSearchParams(location.search).get('next') || '';
        const safe = next && /^[A-Za-z0-9._\-/?#%=]+$/.test(next) && !next.includes('://')
          ? next
          : 'Home.html';
        window.location.href = safe;
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
      if (submitBtn) {
        submitBtn.innerHTML = 'เข้าสู่ระบบ <span class="material-symbols-outlined pts-login__submit-ico">login</span>';
        submitBtn.disabled = false;
      }
    }
  });
})();
