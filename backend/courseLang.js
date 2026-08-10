/**
 * Course bilingual helpers (Thai-first).
 * Columns: course_name_th/en, instructor_name_th/en, description_th/en
 * Legacy monolingual columns stay as Thai mirror for older queries.
 */

function resolveLang(input) {
    const raw = String(input || '').trim().toLowerCase();
    return raw === 'en' ? 'en' : 'th';
}

function resolveLangFromReq(req) {
    if (!req) return 'th';
    const q = req.query && req.query.lang;
    const header = req.headers && (req.headers['x-pts-lang'] || req.headers['x-lang']);
    return resolveLang(q || header || 'th');
}

function pickText(row, base, lang) {
    if (!row) return '';
    const l = resolveLang(lang);
    const th = row[`${base}_th`] != null ? row[`${base}_th`] : row[base];
    const en = row[`${base}_en`];
    const thStr = th != null ? String(th).trim() : '';
    const enStr = en != null ? String(en).trim() : '';
    if (l === 'en') return enStr || thStr || '';
    return thStr || enStr || '';
}

/** Apply Thai-first localization onto convenience fields. */
function localizeCourseRow(row, lang) {
    if (!row || typeof row !== 'object') return row;
    const l = resolveLang(lang);
    const out = { ...row };
    out.course_name = pickText(row, 'course_name', l);
    out.instructor_name = pickText(row, 'instructor_name', l);
    out.description = pickText(row, 'description', l);
    out._lang = l;
    return out;
}

function localizeCourseRows(rows, lang) {
    if (!Array.isArray(rows)) return rows;
    return rows.map((r) => localizeCourseRow(r, lang));
}

/**
 * SQL select list for bilingual course text + Thai-default convenience aliases.
 * Keeps legacy course_name / instructor_name / description as Thai fallbacks.
 * @param {string} [alias='c'] table alias ('' for no alias)
 */
function courseBilingualSelect(alias = 'c') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}course_name_th`,
        `${a}course_name_en`,
        `${a}instructor_name_th`,
        `${a}instructor_name_en`,
        `${a}description_th`,
        `${a}description_en`,
        `COALESCE(NULLIF(LTRIM(RTRIM(${a}course_name_th)), N''), ${a}course_name) AS course_name`,
        `COALESCE(NULLIF(LTRIM(RTRIM(${a}instructor_name_th)), N''), ${a}instructor_name) AS instructor_name`,
        `COALESCE(NULLIF(LTRIM(RTRIM(${a}description_th)), N''), ${a}description) AS description`
    ].join(',\n                    ');
}

/** Short name-only select (joins / messages). */
function courseNameSelect(alias = 'c') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}course_name_th`,
        `${a}course_name_en`,
        `COALESCE(NULLIF(LTRIM(RTRIM(${a}course_name_th)), N''), ${a}course_name) AS course_name`
    ].join(', ');
}

/** Normalize admin body into th/en (+ legacy Thai mirrors). */
function normalizeCourseBody(body) {
    const b = body || {};
    const nameTh = firstNonEmpty(b.course_name_th, b.course_name);
    const nameEn = firstNonEmpty(b.course_name_en, null);
    const instructorTh = firstNonEmpty(b.instructor_name_th, b.instructor_name);
    const instructorEn = firstNonEmpty(b.instructor_name_en, null);
    const descTh = firstNonEmpty(b.description_th, b.description);
    const descEn = firstNonEmpty(b.description_en, null);
    return {
        course_name_th: nameTh,
        course_name_en: nameEn,
        instructor_name_th: instructorTh,
        instructor_name_en: instructorEn,
        description_th: descTh,
        description_en: descEn,
        // legacy mirrors (Thai-first)
        course_name: nameTh,
        instructor_name: instructorTh,
        description: descTh
    };
}

function firstNonEmpty(...vals) {
    for (const v of vals) {
        if (v === undefined || v === null) continue;
        const s = String(v);
        if (s.trim() !== '') return s;
        if (v === '') return '';
    }
    return null;
}

module.exports = {
    resolveLang,
    resolveLangFromReq,
    pickText,
    localizeCourseRow,
    localizeCourseRows,
    courseBilingualSelect,
    courseNameSelect,
    normalizeCourseBody
};
