/** Build Alwayzz-style curved line decorations for auth pages */
(function () {
  function makeLines(host, side, count) {
    if (!host) return;
    host.innerHTML = '';
    for (var i = 0; i < count; i++) {
      var el = document.createElement('span');
      el.className = 'pts-auth-line pts-auth-line--' + side;
      var size = 60 + i * 10;
      if (side === 'top') {
        el.style.width = size + 'px';
        el.style.marginLeft = (-size / 2) + 'px';
        el.style.height = Math.min(36 + i * 4, 72) + 'px';
      } else {
        el.style.width = size + 'px';
      }
      el.style.animationDelay = (i * 0.25) + 's';
      el.style.zIndex = String(count - i);
      host.appendChild(el);
    }
  }

  function mount() {
    var root = document.querySelector('.pts-auth-scene');
    if (!root) return;
    makeLines(root.querySelector('.pts-auth-scene__lines--left'), 'left', 20);
    makeLines(root.querySelector('.pts-auth-scene__lines--right'), 'right', 20);
    makeLines(root.querySelector('.pts-auth-scene__lines--top'), 'top', 12);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
