/**
 * Course text i18n — matches BD_PTS.dbo.courses bilingual columns.
 * Default Thai → *_th ; English UI → *_en (fallback Thai).
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
      if (localStorage.getItem('pts_lang_pref') === 'en') return 'en';
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

  function getField(row, key) {
    if (!row) return '';
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      var direct = norm(row[key]);
      if (direct) return direct;
    }
    var want = String(key).toLowerCase();
    for (var k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (String(k).toLowerCase() === want) {
        var v = norm(row[k]);
        if (v) return v;
      }
    }
    return '';
  }

  function pick(row, base) {
    if (!row) return '';
    var lang = currentLang();
    var th = getField(row, base + '_th');
    var en = getField(row, base + '_en');
    var legacy = getField(row, base);
    if (lang === 'en') return en || th || legacy || '';
    return th || en || legacy || '';
  }

  function localize(row) {
    if (!row || typeof row !== 'object') return row;
    var out = Object.assign({}, row);
    out.course_name_th = getField(row, 'course_name_th') || null;
    out.course_name_en = getField(row, 'course_name_en') || null;
    out.instructor_name_th = getField(row, 'instructor_name_th') || null;
    out.instructor_name_en = getField(row, 'instructor_name_en') || null;
    out.description_th = getField(row, 'description_th') || null;
    out.description_en = getField(row, 'description_en') || null;
    out.course_name = pick(out, 'course_name');
    out.instructor_name = pick(out, 'instructor_name');
    out.description = pick(out, 'description');
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
