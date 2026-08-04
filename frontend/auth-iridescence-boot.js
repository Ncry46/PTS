/**
 * Boot Iridescence on auth pages (Login / Register)
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
  if (!el) return;
  mountIridescence(el, {
    color: DEFAULTS.color,
    mouseReact: DEFAULTS.mouseReact,
    amplitude: DEFAULTS.amplitude,
    speed: DEFAULTS.speed
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
