/**
 * Single password visibility eye per field.
 * - Hides browser native reveal (Edge ::-ms-reveal) via site.css
 * - Shows our eye only when the field has a value
 * - Works with existing toggle buttons or creates one automatically
 */
(function (global) {
  var ICON_SHOW = 'visibility';
  var ICON_HIDE = 'visibility_off';

  function findToggleButton(input) {
    var wrap = input.parentElement;
    if (!wrap) return null;
    var byAttr = wrap.querySelector('button[data-pts-pw-toggle]');
    if (byAttr) return byAttr;
    var buttons = wrap.querySelectorAll('button[type="button"]');
    for (var i = 0; i < buttons.length; i++) {
      var icon = buttons[i].querySelector('.material-symbols-outlined');
      if (!icon) continue;
      var name = (icon.textContent || '').trim();
      if (name === ICON_SHOW || name === ICON_HIDE || name.indexOf('visibility') === 0) {
        return buttons[i];
      }
    }
    return null;
  }

  function ensureWrap(input) {
    var parent = input.parentElement;
    if (parent && (parent.classList.contains('pts-pw-wrap') || parent.classList.contains('relative') || parent.classList.contains('group'))) {
      parent.classList.add('pts-pw-wrap');
      return parent;
    }
    var wrap = document.createElement('div');
    wrap.className = 'pts-pw-wrap';
    parent.insertBefore(wrap, input);
    wrap.appendChild(input);
    return wrap;
  }

  function ensureToggle(input) {
    if (!input || input.dataset.ptsPwBound === '1') return;
    if (String(input.type).toLowerCase() !== 'password' && input.dataset.ptsPwField !== '1') return;

    input.dataset.ptsPwBound = '1';
    input.dataset.ptsPwField = '1';

    var wrap = ensureWrap(input);
    var btn = findToggleButton(input);
    var icon;

    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pts-pw-toggle hidden';
      btn.setAttribute('data-pts-pw-toggle', '1');
      btn.setAttribute('aria-label', 'แสดงหรือซ่อนรหัสผ่าน');
      icon = document.createElement('span');
      icon.className = 'material-symbols-outlined';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = ICON_SHOW;
      btn.appendChild(icon);
      wrap.appendChild(btn);
      input.classList.add('pts-pw-input');
    } else {
      btn.setAttribute('data-pts-pw-toggle', '1');
      btn.classList.add('pts-pw-toggle');
      btn.removeAttribute('onclick');
      icon = btn.querySelector('.material-symbols-outlined');
      if (!icon) {
        icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = ICON_SHOW;
        btn.textContent = '';
        btn.appendChild(icon);
      }
      // Keep only one icon child
      Array.from(btn.querySelectorAll('.material-symbols-outlined')).forEach(function (el, idx) {
        if (idx > 0) el.remove();
      });
      icon = btn.querySelector('.material-symbols-outlined');
    }

    function sync() {
      var hasValue = input.value.length > 0;
      btn.classList.toggle('hidden', !hasValue);
      btn.style.transform = '';
      btn.style.top = '';
      btn.style.bottom = '';
      if (!hasValue) {
        input.type = 'password';
        if (icon) icon.textContent = ICON_SHOW;
      }
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      btn.style.transform = '';
      if (!input.value.length) return;
      if (input.type === 'password') {
        input.type = 'text';
        if (icon) icon.textContent = ICON_HIDE;
      } else {
        input.type = 'password';
        if (icon) icon.textContent = ICON_SHOW;
      }
    });

    input.addEventListener('input', sync);
    input.addEventListener('change', sync);
    sync();
  }

  function bindAll(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('input[type="password"], input[data-pts-pw-field="1"]').forEach(ensureToggle);
  }

  global.PtsPasswordToggle = { bindAll: bindAll, ensureToggle: ensureToggle };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { bindAll(document); });
  } else {
    bindAll(document);
  }
})(window);
