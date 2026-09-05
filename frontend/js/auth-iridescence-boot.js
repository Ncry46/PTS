/**
 * Boot Iridescence on auth pages — replaces previous geometric background.
 */
import { mountIridescence } from './Iridescence.js';

const DEFAULTS = {
  color: [0.996078431372549, 0.10980392156862745, 0.10980392156862745],
  mouseReact: false,
  amplitude: 0.1,
  speed: 1.0
};

function boot() {
  const el = document.getElementById('auth-iridescence');
  if (!el) {
    console.warn('[Iridescence] #auth-iridescence not found');
    return;
  }
  try {
    mountIridescence(el, DEFAULTS);
  } catch (err) {
    console.error('[Iridescence] boot failed:', err);
    el.style.background = 'rgb(254, 28, 28)';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
