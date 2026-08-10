/**
 * Course text i18n — Thai first; English only when PTSLang is "en".
 * Expects API rows with *_th / *_en (and optional legacy monolingual fields).
 */
(function (global) {
  'use strict';

  function currentLang() {
    try {
      if (global.PTSLang && typeof global.PTSLang.get === 'function') {
        return global.PTSLang.get() === 'en' ? 'en' : 'th';
      }
    } catch (_) { /* ignore */ }
    try {
      var saved = localStorage.getItem('pts_lang_pref');
      if (saved === 'en') return 'en';
    } catch (_) { /* ignore */ }
    return 'th';
  }

  function pick(row, base) {
    if (!row) return '';
    var lang = currentLang();
    var th = row[base + '_th'] != null ? row[base + '_th'] : row[base];
    var en = row[base + '_en'];
    var thStr = th != null ? String(th).trim() : '';
    var enStr = en != null ? String(en).trim() : '';
    if (lang === 'en') return enStr || thStr || '';
    return thStr || enStr || '';
  }

  function localize(row) {
    if (!row || typeof row !== 'object') return row;
    var out = Object.assign({}, row);
    out.course_name = pick(row, 'course_name');
    out.instructor_name = pick(row, 'instructor_name');
    out.description = pick(row, 'description');
    return out;
  }

  function localizeAll(rows) {
    if (!Array.isArray(rows)) return rows;
    return rows.map(localize);
  }

  global.PTSCourseI18n = {
    lang: currentLang,
    pick: pick,
    name: function (row) { return pick(row, 'course_name'); },
    instructor: function (row) { return pick(row, 'instructor_name'); },
    description: function (row) { return pick(row, 'description'); },
    localize: localize,
    localizeAll: localizeAll
  };
})(typeof window !== 'undefined' ? window : globalThis);
