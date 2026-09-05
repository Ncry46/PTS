/**
 * Iridescence — vanilla port of React Bits (ogl + WebGL)
 * Imports ogl from vendored frontend/vendor/ogl (no npm runtime needed).
 */
import { Renderer, Program, Mesh, Color, Triangle } from '../vendor/ogl/index.js';

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uResolution;
uniform vec2 uMouse;
uniform float uAmplitude;
uniform float uSpeed;
varying vec2 vUv;
void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;
  uv += (uMouse - vec2(0.5)) * uAmplitude;
  float d = -uTime * 0.5 * uSpeed;
  float a = 0.0;
  for (float i = 0.0; i < 8.0; ++i) {
    a += cos(i - d - a * uv.x);
    d += sin(uv.y * i + a);
  }
  d += uTime * 0.5 * uSpeed;
  vec3 col = vec3(cos(uv * vec2(d, a)) * 0.6 + 0.4, cos(a + d) * 0.5 + 0.5);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * uColor;
  gl_FragColor = vec4(col, 1.0);
}
`;

function solidFallback(container, rgb) {
  container.classList.add('iridescence-container', 'is-fallback');
  container.style.background = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/**
 * @returns {() => void} destroy
 */
export function mountIridescence(container, options = {}) {
  if (!container) return () => {};

  const useColor = [
    Number((options.color && options.color[0]) ?? 0.996),
    Number((options.color && options.color[1]) ?? 0.11),
    Number((options.color && options.color[2]) ?? 0.11)
  ];
  const useSpeed = Number.isFinite(Number(options.speed)) ? Number(options.speed) : 1.0;
  const useAmplitude = Number.isFinite(Number(options.amplitude)) ? Number(options.amplitude) : 0.1;
  const useMouse = options.mouseReact === true;
  const rgb255 = [
    Math.round(useColor[0] * 255),
    Math.round(useColor[1] * 255),
    Math.round(useColor[2] * 255)
  ];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    solidFallback(container, rgb255);
    return () => {
      container.classList.remove('iridescence-container', 'is-fallback');
      container.style.background = '';
      container.innerHTML = '';
    };
  }

  let renderer;
  let gl;
  try {
    renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: false });
    gl = renderer.gl;
  } catch (err) {
    console.warn('[Iridescence] WebGL unavailable:', err);
    solidFallback(container, rgb255);
    return () => {
      container.classList.remove('iridescence-container', 'is-fallback');
      container.style.background = '';
    };
  }

  container.classList.add('iridescence-container');
  container.innerHTML = '';
  const mousePos = { x: 0.5, y: 0.5 };
  gl.clearColor(useColor[0], useColor[1], useColor[2], 1);

  let program;
  let animateId = 0;

  function resize() {
    const w = Math.max(1, container.clientWidth || window.innerWidth || 1);
    const h = Math.max(1, container.clientHeight || window.innerHeight || 1);
    renderer.setSize(w, h);
    if (program) {
      program.uniforms.uResolution.value = new Color(
        gl.canvas.width,
        gl.canvas.height,
        gl.canvas.width / Math.max(gl.canvas.height, 1)
      );
    }
  }

  window.addEventListener('resize', resize, false);

  try {
    const geometry = new Triangle(gl);
    program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new Color(useColor[0], useColor[1], useColor[2]) },
        uResolution: {
          value: new Color(1, 1, 1)
        },
        uMouse: { value: new Float32Array([mousePos.x, mousePos.y]) },
        uAmplitude: { value: useAmplitude },
        uSpeed: { value: useSpeed }
      }
    });
    const mesh = new Mesh(gl, { geometry, program });

    function update(t) {
      animateId = requestAnimationFrame(update);
      program.uniforms.uTime.value = t * 0.001;
      renderer.render({ scene: mesh });
    }

    container.appendChild(gl.canvas);
    resize();
    animateId = requestAnimationFrame(update);

    function handleMouseMove(e) {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / Math.max(rect.width, 1);
      const y = 1.0 - (e.clientY - rect.top) / Math.max(rect.height, 1);
      mousePos.x = x;
      mousePos.y = y;
      program.uniforms.uMouse.value[0] = x;
      program.uniforms.uMouse.value[1] = y;
    }
    if (useMouse) container.addEventListener('mousemove', handleMouseMove);

    // Mark success for CSS
    document.documentElement.classList.add('has-iridescence');

    return function destroy() {
      cancelAnimationFrame(animateId);
      window.removeEventListener('resize', resize);
      if (useMouse) container.removeEventListener('mousemove', handleMouseMove);
      if (gl.canvas && gl.canvas.parentNode === container) container.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      container.classList.remove('iridescence-container');
      document.documentElement.classList.remove('has-iridescence');
    };
  } catch (err) {
    console.warn('[Iridescence] shader init failed:', err);
    solidFallback(container, rgb255);
    return () => {
      container.classList.remove('iridescence-container', 'is-fallback');
      container.style.background = '';
      container.innerHTML = '';
    };
  }
}

export default mountIridescence;
