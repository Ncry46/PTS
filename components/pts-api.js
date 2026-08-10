/**
 * Stable API helper for PTS pages.
 * - always credentials + no-store (กัน cache ค้างหลังรีเฟรช)
 * - sends current UI language (default Thai) via X-PTS-Lang + ?lang=
 * - retry ครั้งเดียวเมื่อเน็ต/DB หลุดชั่วคราว
 * - parse JSON อย่างปลอดภัย
 */
(function (global) {
  'use strict';

  var TRANSIENT = /^(Failed to fetch|NetworkError|Load failed|fetch failed|The network connection was lost)/i;

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function isTransientStatus(status) {
    return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
  }

  function currentLang() {
    try {
      if (typeof global.PTSLang === 'object' && global.PTSLang && typeof global.PTSLang.get === 'function') {
        return global.PTSLang.get() === 'en' ? 'en' : 'th';
      }
    } catch (_) { /* ignore */ }
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('pts_lang_pref') === 'en') return 'en';
    } catch (_) { /* ignore */ }
    return 'th';
  }

  /** Append ?lang=th|en for course/content APIs (default Thai). */
  function withLang(url, lang) {
    var l = lang === 'en' ? 'en' : 'th';
    var s = String(url || '');
    if (!s || /[?&]lang=/i.test(s)) return s;
    return s + (s.indexOf('?') >= 0 ? '&' : '?') + 'lang=' + encodeURIComponent(l);
  }

  /**
   * @param {string} url
   * @param {RequestInit & { retries?: number, retryDelayMs?: number, timeoutMs?: number, lang?: string }} [options]
   */
  async function ptsFetch(url, options) {
    var opts = options || {};
    var retries = opts.retries == null ? 1 : Number(opts.retries);
    var retryDelayMs = opts.retryDelayMs == null ? 450 : Number(opts.retryDelayMs);
    var timeoutMs = opts.timeoutMs == null ? 20000 : Number(opts.timeoutMs);
    var attempt = 0;
    var lastErr = null;
    var lang = opts.lang === 'en' || opts.lang === 'th' ? opts.lang : currentLang();

    while (attempt <= retries) {
      attempt += 1;
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = null;
      try {
        if (controller && timeoutMs > 0) {
          timer = setTimeout(function () {
            try { controller.abort(); } catch (_) { /* ignore */ }
          }, timeoutMs);
        }

        var headers = Object.assign(
          { Accept: 'application/json' },
          opts.headers || {}
        );
        if (!headers['X-PTS-Lang'] && !headers['x-pts-lang']) {
          headers['X-PTS-Lang'] = lang;
        }

        var init = Object.assign({}, opts, {
          credentials: opts.credentials || 'include',
          cache: opts.cache || 'no-store',
          headers: headers
        });
        if (controller) init.signal = controller.signal;
        delete init.retries;
        delete init.retryDelayMs;
        delete init.timeoutMs;
        delete init.lang;

        var res = await fetch(withLang(url, lang), init);
        var text = await res.text();
        var data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (_) {
            data = { success: false, message: text.slice(0, 200) || 'ตอบกลับไม่ใช่ JSON' };
          }
        } else {
          data = { success: res.ok };
        }

        if (!res.ok && isTransientStatus(res.status) && attempt <= retries) {
          lastErr = new Error((data && data.message) || ('HTTP ' + res.status));
          await sleep(retryDelayMs * attempt);
          continue;
        }

        return { ok: res.ok, status: res.status, data: data, response: res };
      } catch (err) {
        lastErr = err;
        var msg = String((err && err.message) || err || '');
        var aborted = err && err.name === 'AbortError';
        if (attempt <= retries && (aborted || TRANSIENT.test(msg) || /ECONNRESET|ESOCKET|ETIMEOUT/i.test(msg))) {
          await sleep(retryDelayMs * attempt);
          continue;
        }
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    throw lastErr || new Error('โหลดไม่สำเร็จ');
  }

  async function ptsJson(url, options) {
    var out = await ptsFetch(url, options);
    if (!out.ok || (out.data && out.data.success === false)) {
      var err = new Error((out.data && out.data.message) || ('HTTP ' + out.status));
      err.status = out.status;
      err.data = out.data;
      throw err;
    }
    return out.data;
  }

  global.ptsFetch = ptsFetch;
  global.ptsJson = ptsJson;
  global.ptsLang = currentLang;
  global.ptsWithLang = withLang;
})(typeof window !== 'undefined' ? window : globalThis);
