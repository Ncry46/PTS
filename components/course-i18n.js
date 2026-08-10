/**
 * Course text i18n — Thai first; English only when PTSLang is "en".
 * Empty *_th / *_en never blank out a real legacy course_name value.
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

  function norm(value) {
    if (value == null) return '';
    if (Array.isArray(value)) {
      for (var i = value.length - 1; i >= 0; i -= 1) {
        var s = norm(value[i]);
        if (s) return s;
      }
      return '';
    }
    return String(value).trim();
  }

  function pick(row, base) {
    if (!row) return '';
    var lang = currentLang();
    var th = norm(row[base + '_th']);
    var en = norm(row[base + '_en']);
    var legacy = norm(row[base]);
    if (lang === 'en') return en || th || legacy || '';
    return th || legacy || en || '';
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
