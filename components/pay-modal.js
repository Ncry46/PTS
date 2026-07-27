/**
 * PTSPayModal — course payment overlay (QR + card + coupon)
 * Usage: PTSPayModal.open({ courseId, courseName, price, onSuccess })
 */
(function () {
  if (window.PTSPayModal) return;

  var state = {
    courseId: null,
    courseName: '',
    price: 0,
    method: 'promptpay',
    paymentId: null,
    qrWidget: null,
    onSuccess: null
  };

  function esc(t) {
    return String(t || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function money(n) {
    return '฿' + Number(n || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function ensureDom() {
    var root = document.getElementById('pts-pay-modal');
    if (root) return root;

    root = document.createElement('div');
    root.id = 'pts-pay-modal';
    root.className = 'pts-pay-modal';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'pts-pay-modal-title');
    root.innerHTML =
      '<div class="pts-pay-modal__card" data-pay-card>' +
      '  <button type="button" class="pts-pay-modal__close" data-pay-close aria-label="ปิด">' +
      '    <span class="material-symbols-outlined" style="font-size:20px">close</span>' +
      '  </button>' +
      '  <p class="pts-pay-modal__eyebrow">Checkout</p>' +
      '  <h2 class="pts-pay-modal__title" id="pts-pay-modal-title">ชำระเงินหลักสูตร</h2>' +
      '  <p class="pts-pay-modal__sub" data-pay-sub></p>' +
      '  <div class="pay-summary">' +
      '    <span class="pay-summary__label">ยอดชำระ</span>' +
      '    <span class="pay-summary__amount" data-pay-amount>฿0</span>' +
      '  </div>' +
      '  <p class="text-sm font-bold mb-2" style="margin:0 0 8px;font-size:13px;font-weight:700">ช่องทางชำระเงิน</p>' +
      '  <div class="pay-methods" role="tablist" aria-label="ช่องทางชำระเงิน">' +
      '    <button type="button" class="pay-method is-active" data-method="promptpay" role="tab" aria-selected="true">' +
      '      <span class="material-symbols-outlined">qr_code_2</span>' +
      '      <strong>QR CODE</strong>' +
      '      <span>สแกน PromptPay แล้วแนบสลิป</span>' +
      '    </button>' +
      '    <button type="button" class="pay-method" data-method="card" role="tab" aria-selected="false">' +
      '      <span class="material-symbols-outlined">credit_card</span>' +
      '      <strong>บัตรเครดิต</strong>' +
      '      <span>อนุมัติอัตโนมัติทันที</span>' +
      '    </button>' +
      '  </div>' +
      '  <div class="pay-qr-box is-open" data-panel="promptpay">' +
      '    <div class="pay-qr-frame" data-qr-frame><span class="text-sm text-on-surface-variant">กดสร้าง QR เพื่อเริ่มชำระ</span></div>' +
      '    <p class="pay-qr-meta" data-qr-meta>กด “สร้าง QR CODE” เพื่อชำระ</p>' +
      '    <button type="button" class="pts-btn pts-btn-primary w-full" data-create-qr>สร้าง QR CODE</button>' +
      '    <div data-slip-box hidden style="margin-top:12px;text-align:left">' +
      '      <label class="pts-field"><span>แนบสลิปโอนเงิน</span>' +
      '        <input type="file" data-slip-file class="pts-input" accept="image/jpeg,image/png,image/webp,image/gif">' +
      '      </label>' +
      '      <button type="button" class="pts-btn pts-btn-outline w-full" data-confirm-qr style="margin-top:8px">ส่งสลิปให้แอดมินตรวจสอบ</button>' +
      '    </div>' +
      '  </div>' +
      '  <div class="pay-card-box" data-panel="card">' +
      '    <div class="pay-card-grid">' +
      '      <label class="pts-field"><span>ชื่อบนบัตร</span><input data-card-name class="pts-input" autocomplete="cc-name" placeholder="NAME ON CARD"></label>' +
      '      <label class="pts-field"><span>เลขบัตร</span><input data-card-number class="pts-input" inputmode="numeric" autocomplete="cc-number" placeholder="•••• •••• •••• ••••" maxlength="19"></label>' +
      '      <div class="pay-card-grid pay-card-grid--split">' +
      '        <label class="pts-field"><span>หมดอายุ (MM/YY)</span><input data-card-exp class="pts-input" inputmode="numeric" autocomplete="cc-exp" placeholder="MM/YY" maxlength="5"></label>' +
      '        <label class="pts-field"><span>CVC</span><input data-card-cvc class="pts-input" inputmode="numeric" autocomplete="cc-csc" placeholder="•••" maxlength="4"></label>' +
      '      </div>' +
      '    </div>' +
      '    <button type="button" class="pts-btn pts-btn-primary w-full" data-pay-card>ชำระด้วยบัตรเครดิต</button>' +
      '  </div>' +
      '  <div class="pts-pay-modal__coupon">' +
      '    <label class="pts-pay-modal__coupon-label" for="pts-pay-coupon">คูปองโค้ด</label>' +
      '    <div class="pts-pay-modal__coupon-row">' +
      '      <input id="pts-pay-coupon" data-coupon class="pts-input" placeholder="กรอกคูปองโค้ด" autocomplete="off">' +
      '      <button type="button" class="pts-btn pts-btn-outline" data-apply-coupon>ใช้คูปอง</button>' +
      '    </div>' +
      '  </div>' +
      '  <p class="pts-pay-modal__msg" data-pay-msg aria-live="polite"></p>' +
      '</div>';

    document.body.appendChild(root);
    bind(root);
    return root;
  }

  function $(sel, root) {
    return (root || document.getElementById('pts-pay-modal')).querySelector(sel);
  }

  function setMsg(text, ok) {
    var el = $('[data-pay-msg]');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'pts-pay-modal__msg' + (text ? (ok ? ' is-ok' : ' is-err') : '');
  }

  function setMethod(method) {
    state.method = method === 'card' ? 'card' : 'promptpay';
    var root = document.getElementById('pts-pay-modal');
    root.querySelectorAll('.pay-method').forEach(function (btn) {
      var on = btn.getAttribute('data-method') === state.method;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    root.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.classList.toggle('is-open', panel.getAttribute('data-panel') === state.method);
    });
    setMsg('');
  }

  function formatCardNumber(value) {
    return String(value || '')
      .replace(/\D/g, '')
      .slice(0, 16)
      .replace(/(\d{4})(?=\d)/g, '$1 ')
      .trim();
  }

  function formatExp(value) {
    var d = String(value || '').replace(/\D/g, '').slice(0, 4);
    if (d.length <= 2) return d;
    return d.slice(0, 2) + '/' + d.slice(2);
  }

  function renderQr(payload) {
    var frame = $('[data-qr-frame]');
    frame.innerHTML = '';
    if (typeof QRCode === 'undefined') {
      frame.innerHTML = '<span class="text-sm">โหลด QR library ไม่สำเร็จ</span>';
      return;
    }
    state.qrWidget = new QRCode(frame, {
      text: payload,
      width: 196,
      height: 196,
      correctLevel: QRCode.CorrectLevel.M
    });
  }

  async function createPayment(method) {
    if (!state.courseId) throw new Error('ไม่พบหลักสูตร');
    if (!(Number(state.price) > 0) && method !== 'access_code') {
      throw new Error('หลักสูตรนี้ยังไม่มีราคา กรุณาติดต่อแอดมิน');
    }
    var res = await fetch('/api/courses/' + encodeURIComponent(state.courseId) + '/pay', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: Number(state.price) || 0, method: method })
    });
    var data = await res.json();
    if (!res.ok || data.success === false) throw new Error(data.message || 'สร้างรายการไม่สำเร็จ');
    if (data.already_paid) throw new Error(data.message || 'ชำระหลักสูตรนี้แล้ว');
    return data;
  }

  function finishSuccess(message) {
    setMsg(message || 'ชำระสำเร็จ', true);
    if (typeof state.onSuccess === 'function') {
      try { state.onSuccess(); } catch (e) {}
    }
    setTimeout(function () {
      close();
      location.href = 'Learn.html?courseId=' + encodeURIComponent(state.courseId);
    }, 700);
  }

  function bind(root) {
    root.addEventListener('click', function (e) {
      if (e.target === root || e.target.closest('[data-pay-close]')) close();
    });

    root.querySelectorAll('.pay-method').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setMethod(btn.getAttribute('data-method'));
      });
    });

    var cardNumber = $('[data-card-number]', root);
    var cardExp = $('[data-card-exp]', root);
    var cardCvc = $('[data-card-cvc]', root);
    if (cardNumber) {
      cardNumber.addEventListener('input', function (e) {
        e.target.value = formatCardNumber(e.target.value);
      });
    }
    if (cardExp) {
      cardExp.addEventListener('input', function (e) {
        e.target.value = formatExp(e.target.value);
      });
    }
    if (cardCvc) {
      cardCvc.addEventListener('input', function (e) {
        e.target.value = String(e.target.value || '').replace(/\D/g, '').slice(0, 4);
      });
    }

    $('[data-create-qr]', root).addEventListener('click', async function () {
      var btn = $('[data-create-qr]', root);
      btn.disabled = true;
      btn.textContent = 'กำลังสร้าง QR...';
      try {
        setMethod('promptpay');
        var data = await createPayment('promptpay');
        state.paymentId = data.data.payment_id;
        var payload = data.promptpay && data.promptpay.qr_payload;
        if (!payload) throw new Error('ไม่ได้รับข้อมูล QR');
        renderQr(payload);
        $('[data-qr-meta]', root).innerHTML =
          'ยอด <strong>' + money(data.data.amount) + '</strong><br>' +
          'รหัสอ้างอิง <strong>' + esc(data.data.reference_code) + '</strong>';
        $('[data-slip-box]', root).hidden = false;
        setMsg(data.message || 'สร้าง QR แล้ว — โอนแล้วแนบสลิปด้านล่าง', true);
      } catch (err) {
        setMsg(err.message || 'สร้าง QR ไม่สำเร็จ', false);
      } finally {
        btn.disabled = false;
        btn.textContent = 'สร้าง QR CODE';
      }
    });

    $('[data-confirm-qr]', root).addEventListener('click', async function () {
      if (!state.paymentId) return setMsg('ยังไม่มีรายการ QR', false);
      var fileInput = $('[data-slip-file]', root);
      if (!fileInput.files || !fileInput.files[0]) {
        return setMsg('กรุณาแนบรูปสลิปก่อนส่ง', false);
      }
      var btn = $('[data-confirm-qr]', root);
      btn.disabled = true;
      try {
        var fd = new FormData();
        fd.append('slip', fileInput.files[0]);
        var res = await fetch('/api/payments/' + state.paymentId + '/confirm', {
          method: 'POST',
          credentials: 'include',
          body: fd
        });
        var data = await res.json();
        if (!res.ok || data.success === false) throw new Error(data.message || 'ส่งสลิปไม่สำเร็จ');
        setMsg(data.message || 'ส่งสลิปแล้ว รอแอดมินตรวจสอบ', true);
        $('[data-slip-box]', root).hidden = true;
        fileInput.value = '';
      } catch (err) {
        setMsg(err.message, false);
      } finally {
        btn.disabled = false;
      }
    });

    $('[data-pay-card]', root).addEventListener('click', async function () {
      var btn = $('[data-pay-card]', root);
      btn.disabled = true;
      btn.textContent = 'กำลังชำระ...';
      try {
        setMethod('card');
        var data = await createPayment('card');
        var paymentId = data.data.payment_id;
        state.paymentId = paymentId;
        var exp = ($('[data-card-exp]', root).value || '').split('/');
        var res = await fetch('/api/payments/' + paymentId + '/charge-card', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            card_name: $('[data-card-name]', root).value,
            card_number: $('[data-card-number]', root).value,
            exp_month: exp[0] || '',
            exp_year: exp[1] || '',
            cvc: $('[data-card-cvc]', root).value
          })
        });
        var result = await res.json();
        if (!res.ok || result.success === false) throw new Error(result.message || 'ชำระด้วยบัตรไม่สำเร็จ');
        finishSuccess(result.message || 'ชำระสำเร็จ');
      } catch (err) {
        setMsg(err.message, false);
      } finally {
        btn.disabled = false;
        btn.textContent = 'ชำระด้วยบัตรเครดิต';
      }
    });

    $('[data-apply-coupon]', root).addEventListener('click', async function () {
      var btn = $('[data-apply-coupon]', root);
      btn.disabled = true;
      try {
        var code = ($('[data-coupon]', root).value || '').trim();
        if (!code) throw new Error('กรุณากรอกคูปองโค้ด');
        var res = await fetch('/api/access-codes/redeem', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code, courseId: state.courseId })
        });
        var data = await res.json();
        if (!res.ok || data.success === false) throw new Error(data.message || 'ใช้คูปองไม่สำเร็จ');
        $('[data-coupon]', root).value = '';
        finishSuccess(data.message || 'ใช้คูปองสำเร็จ — เปิดสิทธิ์เรียนแล้ว');
      } catch (err) {
        setMsg(err.message, false);
      } finally {
        btn.disabled = false;
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('is-open')) close();
    });
  }

  function open(opts) {
    opts = opts || {};
    if (!opts.courseId) {
      console.warn('PTSPayModal.open requires courseId');
      return;
    }
    state.courseId = opts.courseId;
    state.courseName = opts.courseName || '';
    state.price = Number(opts.price || 0);
    state.paymentId = null;
    state.onSuccess = opts.onSuccess || null;

    var root = ensureDom();
    $('[data-pay-sub]', root).textContent = state.courseName
      ? 'หลักสูตร: ' + state.courseName
      : 'เลือกช่องทางชำระเงินด้านล่าง';
    $('[data-pay-amount]', root).textContent = money(state.price);
    $('[data-qr-frame]', root).innerHTML = '<span class="text-sm text-on-surface-variant">กดสร้าง QR เพื่อเริ่มชำระ</span>';
    $('[data-qr-meta]', root).textContent = 'กด “สร้าง QR CODE” เพื่อชำระ';
    $('[data-slip-box]', root).hidden = true;
    var slip = $('[data-slip-file]', root);
    if (slip) slip.value = '';
    setMethod('promptpay');
    setMsg('');

    root.classList.add('is-open');
    document.body.classList.add('pts-pay-modal-open');
  }

  function close() {
    var root = document.getElementById('pts-pay-modal');
    if (!root) return;
    root.classList.remove('is-open');
    document.body.classList.remove('pts-pay-modal-open');
  }

  window.PTSPayModal = { open: open, close: close };
})();
