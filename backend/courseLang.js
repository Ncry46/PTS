/**
 * Course bilingual helpers.
 * Reads: course_name_th/en, instructor_name_th/en, description_th/en
 * Default display language = Thai; English when UI lang is en.
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

function normText(value) {
    if (value == null) return '';
    if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i -= 1) {
            const s = normText(value[i]);
            if (s) return s;
        }
        return '';
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(value)) {
        return value.toString('utf8').trim();
    }
    return String(value).trim();
}

/** Lower-case key map so MSSQL driver casing never hides *_th / *_en. */
function rowKeyMap(row) {
    const map = Object.create(null);
    if (!row || typeof row !== 'object') return map;
    for (const key of Object.keys(row)) {
        map[String(key).toLowerCase()] = row[key];
    }
    return map;
}

function fieldFromRow(row, name) {
    if (!row) return '';
    const want = String(name).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(row, name)) {
        const direct = normText(row[name]);
        if (direct) return direct;
    }
    const map = rowKeyMap(row);
    return normText(map[want]);
}

function pickText(row, base, lang) {
    if (!row) return '';
    const l = resolveLang(lang);
    const th = fieldFromRow(row, `${base}_th`);
    const en = fieldFromRow(row, `${base}_en`);
    const legacy = fieldFromRow(row, base);
    if (l === 'en') return en || th || legacy || '';
    return th || legacy || en || '';
}

/** Keep raw bilingual fields + set convenience course_name / instructor_name / description. */
function localizeCourseRow(row, lang) {
    if (!row || typeof row !== 'object') return row;
    const l = resolveLang(lang);
    const out = { ...row };

    // Normalize explicit bilingual fields onto canonical keys
    out.course_name_th = fieldFromRow(row, 'course_name_th') || null;
    out.course_name_en = fieldFromRow(row, 'course_name_en') || null;
    out.instructor_name_th = fieldFromRow(row, 'instructor_name_th') || null;
    out.instructor_name_en = fieldFromRow(row, 'instructor_name_en') || null;
    out.description_th = fieldFromRow(row, 'description_th') || null;
    out.description_en = fieldFromRow(row, 'description_en') || null;

    // If DB only has legacy columns, mirror into *_th so Admin/UI still see them
    if (!out.course_name_th) out.course_name_th = fieldFromRow(row, 'course_name') || null;
    if (!out.instructor_name_th) out.instructor_name_th = fieldFromRow(row, 'instructor_name') || null;
    if (!out.description_th) out.description_th = fieldFromRow(row, 'description') || null;

    out.course_name = pickText(out, 'course_name', l);
    out.instructor_name = pickText(out, 'instructor_name', l);
    out.description = pickText(out, 'description', l);
    out._lang = l;
    return out;
}

function localizeCourseRows(rows, lang) {
    if (!Array.isArray(rows)) return rows;
    return rows.map((r) => localizeCourseRow(r, lang));
}

/**
 * Plain SELECT of bilingual + legacy columns (no SQL COALESCE overwrite).
 * Localization is done in JS via localizeCourseRow.
 */
function courseBilingualSelect(alias = 'c', _lang = 'th') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}[course_name_th] AS course_name_th`,
        `${a}[course_name_en] AS course_name_en`,
        `${a}[instructor_name_th] AS instructor_name_th`,
        `${a}[instructor_name_en] AS instructor_name_en`,
        `${a}[description_th] AS description_th`,
        `${a}[description_en] AS description_en`,
        `${a}[course_name] AS course_name`,
        `${a}[instructor_name] AS instructor_name`,
        `${a}[description] AS description`
    ].join(',\n                    ');
}

/** Legacy-only select when bilingual columns are not available yet. */
function courseLegacySelect(alias = 'c') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}[course_name] AS course_name_th`,
        `CAST(NULL AS NVARCHAR(255)) AS course_name_en`,
        `${a}[instructor_name] AS instructor_name_th`,
        `CAST(NULL AS NVARCHAR(255)) AS instructor_name_en`,
        `${a}[description] AS description_th`,
        `CAST(NULL AS NVARCHAR(MAX)) AS description_en`,
        `${a}[course_name] AS course_name`,
        `${a}[instructor_name] AS instructor_name`,
        `${a}[description] AS description`
    ].join(',\n                    ');
}

function isMissingBilingualColumnError(err) {
    const msg = String((err && err.message) || err || '');
    return /Invalid column name/i.test(msg);
}

let _courseTextModePromise = null;

/** Detect whether dbo.courses has bilingual columns. */
async function resolveCourseTextMode(pool) {
    if (!pool) return 'legacy';
    if (!_courseTextModePromise) {
        _courseTextModePromise = (async () => {
            try {
                const r = await pool.request().query(`
                    SELECT
                        CASE WHEN COL_LENGTH('dbo.courses', 'course_name_th') IS NULL THEN 0 ELSE 1 END AS has_th,
                        CASE WHEN COL_LENGTH('dbo.courses', 'course_name_en') IS NULL THEN 0 ELSE 1 END AS has_en,
                        CASE WHEN COL_LENGTH('dbo.courses', 'instructor_name_th') IS NULL THEN 0 ELSE 1 END AS has_inst_th,
                        CASE WHEN COL_LENGTH('dbo.courses', 'description_th') IS NULL THEN 0 ELSE 1 END AS has_desc_th
                `);
                const row = r.recordset[0] || {};
                // Any bilingual column means we should read the bilingual set
                if (Number(row.has_th) === 1 || Number(row.has_en) === 1
                    || Number(row.has_inst_th) === 1 || Number(row.has_desc_th) === 1) {
                    return 'bilingual';
                }
                return 'legacy';
            } catch (_) {
                return 'legacy';
            }
        })();
    }
    return _courseTextModePromise;
}

function courseTextSelect(alias = 'c', lang = 'th', mode = 'bilingual') {
    return mode === 'bilingual'
        ? courseBilingualSelect(alias, lang)
        : courseLegacySelect(alias);
}

function resetCourseTextModeCache() {
    _courseTextModePromise = null;
}

function courseNameSelect(alias = 'c') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}[course_name_th] AS course_name_th`,
        `${a}[course_name_en] AS course_name_en`,
        `${a}[course_name] AS course_name`
    ].join(', ');
}

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
    }
    return null;
}

module.exports = {
    resolveLang,
    resolveLangFromReq,
    normText,
    fieldFromRow,
    pickText,
    localizeCourseRow,
    localizeCourseRows,
    courseBilingualSelect,
    courseLegacySelect,
    courseTextSelect,
    resolveCourseTextMode,
    resetCourseTextModeCache,
    isMissingBilingualColumnError,
    courseNameSelect,
    normalizeCourseBody
};
