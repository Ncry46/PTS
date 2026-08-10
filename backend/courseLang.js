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

/** Normalize DB/driver values (null, '', arrays from duplicate cols). */
function normText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i -= 1) {
            const s = normText(value[i]);
            if (s) return s;
        }
        return '';
    }
    return String(value).trim();
}

/**
 * Pick localized course text.
 * Empty *_th / *_en never blank out a real legacy value.
 */
function pickText(row, base, lang) {
    if (!row) return '';
    const l = resolveLang(lang);
    const th = normText(row[`${base}_th`]);
    const en = normText(row[`${base}_en`]);
    const legacy = normText(row[base]);
    if (l === 'en') return en || th || legacy || '';
    return th || legacy || en || '';
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
 * SQL select list for bilingual course text + localized convenience aliases.
 * lang=th → Thai first; lang=en → English first (fallback the other way).
 * @param {string} [alias='c'] table alias ('' for no alias)
 * @param {string} [lang='th']
 */
function courseBilingualSelect(alias = 'c', lang = 'th') {
    const a = alias ? `${alias}.` : '';
    const enFirst = resolveLang(lang) === 'en';
    const nameTh = `NULLIF(LTRIM(RTRIM(${a}course_name_th)), N'')`;
    const nameEn = `NULLIF(LTRIM(RTRIM(${a}course_name_en)), N'')`;
    const nameLegacy = `NULLIF(LTRIM(RTRIM(${a}course_name)), N'')`;
    const instTh = `NULLIF(LTRIM(RTRIM(${a}instructor_name_th)), N'')`;
    const instEn = `NULLIF(LTRIM(RTRIM(${a}instructor_name_en)), N'')`;
    const instLegacy = `NULLIF(LTRIM(RTRIM(${a}instructor_name)), N'')`;
    const descTh = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), ${a}description_th))), N'')`;
    const descEn = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), ${a}description_en))), N'')`;
    const descLegacy = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), ${a}description))), N'')`;
    const nameExpr = enFirst
        ? `COALESCE(${nameEn}, ${nameTh}, ${nameLegacy}) AS course_name`
        : `COALESCE(${nameTh}, ${nameLegacy}, ${nameEn}) AS course_name`;
    const instExpr = enFirst
        ? `COALESCE(${instEn}, ${instTh}, ${instLegacy}) AS instructor_name`
        : `COALESCE(${instTh}, ${instLegacy}, ${instEn}) AS instructor_name`;
    const descExpr = enFirst
        ? `COALESCE(${descEn}, ${descTh}, ${descLegacy}) AS description`
        : `COALESCE(${descTh}, ${descLegacy}, ${descEn}) AS description`;
    return [
        `${a}course_name_th`,
        `${a}course_name_en`,
        `${a}instructor_name_th`,
        `${a}instructor_name_en`,
        `${a}description_th`,
        `${a}description_en`,
        nameExpr,
        instExpr,
        descExpr
    ].join(',\n                    ');
}

/** Legacy-only select when bilingual columns are not available yet. */
function courseLegacySelect(alias = 'c') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}course_name AS course_name_th`,
        `CAST(NULL AS NVARCHAR(255)) AS course_name_en`,
        `${a}instructor_name AS instructor_name_th`,
        `CAST(NULL AS NVARCHAR(255)) AS instructor_name_en`,
        `${a}description AS description_th`,
        `CAST(NULL AS NVARCHAR(MAX)) AS description_en`,
        `${a}course_name`,
        `${a}instructor_name`,
        `${a}description`
    ].join(',\n                    ');
}

function isMissingBilingualColumnError(err) {
    const msg = String((err && err.message) || err || '');
    return /Invalid column name\s+'?(course_name_th|course_name_en|instructor_name_th|instructor_name_en|description_th|description_en)'?/i.test(msg);
}

/** Short name-only select (joins / messages). */
function courseNameSelect(alias = 'c') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}course_name_th`,
        `${a}course_name_en`,
        `COALESCE(NULLIF(LTRIM(RTRIM(${a}course_name_th)), N''), NULLIF(LTRIM(RTRIM(${a}course_name)), N''), NULLIF(LTRIM(RTRIM(${a}course_name_en)), N'')) AS course_name`
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
    normText,
    pickText,
    localizeCourseRow,
    localizeCourseRows,
    courseBilingualSelect,
    courseLegacySelect,
    isMissingBilingualColumnError,
    courseNameSelect,
    normalizeCourseBody
};
