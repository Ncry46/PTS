/**
 * Course bilingual helpers for BD_PTS.dbo.courses
 *
 * Physical columns: course_name_th/en, instructor_name_th/en, description_th/en
 * (no legacy course_name / instructor_name / description)
 *
 * Default UI lang = Thai → prefer *_th
 * English UI → prefer *_en (fallback to Thai if empty)
 *
 * Always also emit convenience aliases course_name / instructor_name / description
 * for older frontend that reads those keys.
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
    if (Object.prototype.hasOwnProperty.call(row, name)) {
        const direct = normText(row[name]);
        if (direct) return direct;
    }
    const map = rowKeyMap(row);
    return normText(map[String(name).toLowerCase()]);
}

function pickText(row, base, lang) {
    if (!row) return '';
    const l = resolveLang(lang);
    const th = fieldFromRow(row, `${base}_th`);
    const en = fieldFromRow(row, `${base}_en`);
    // legacy alias only as last resort (older API rows / SELECT *)
    const legacy = fieldFromRow(row, base);
    if (l === 'en') return en || th || legacy || '';
    return th || en || legacy || '';
}

function firstNonEmpty(...vals) {
    for (const v of vals) {
        if (v === undefined || v === null) continue;
        const s = String(v);
        if (s.trim() !== '') return s;
    }
    return null;
}

function localizeCourseRow(row, lang) {
    if (!row || typeof row !== 'object') return row;
    const l = resolveLang(lang);
    const out = { ...row };

    // Prefer exact keys; also accept driver casing quirks via fieldFromRow
    out.course_name_th = fieldFromRow(row, 'course_name_th') || null;
    out.course_name_en = fieldFromRow(row, 'course_name_en') || null;
    out.instructor_name_th = fieldFromRow(row, 'instructor_name_th') || null;
    out.instructor_name_en = fieldFromRow(row, 'instructor_name_en') || null;
    out.description_th = fieldFromRow(row, 'description_th') || null;
    out.description_en = fieldFromRow(row, 'description_en') || null;

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

/** Physical bilingual columns on dbo.courses (current BD_PTS schema). */
const BILINGUAL_COLS = [
    'course_name_th',
    'course_name_en',
    'instructor_name_th',
    'instructor_name_en',
    'description_th',
    'description_en'
];

/** Optional legacy monolingual columns (older DBs only). */
const LEGACY_COLS = ['course_name', 'instructor_name', 'description'];

const TEXT_COLS = [...BILINGUAL_COLS, ...LEGACY_COLS];

let _courseColsPromise = null;

function sqlNz(expr, isMax = false) {
    if (isMax) {
        return `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), ${expr}))), N'')`;
    }
    return `NULLIF(LTRIM(RTRIM(${expr})), N'')`;
}

/**
 * SQL expression for display value from *_th / *_en only (never touches missing legacy cols).
 * th: COALESCE(th, en)   en: COALESCE(en, th)
 */
function displayExpr(alias, base, lang) {
    const a = alias ? `${alias}.` : '';
    const isMax = base === 'description';
    const th = sqlNz(`${a}[${base}_th]`, isMax);
    const en = sqlNz(`${a}[${base}_en]`, isMax);
    if (resolveLang(lang) === 'en') return `COALESCE(${en}, ${th})`;
    return `COALESCE(${th}, ${en})`;
}

/** Convenience: "… AS course_name" for ad-hoc queries. */
function courseDisplaySelect(alias = 'c', lang = 'th') {
    return [
        `${displayExpr(alias, 'course_name', lang)} AS [course_name]`,
        `${displayExpr(alias, 'instructor_name', lang)} AS [instructor_name]`,
        `${displayExpr(alias, 'description', lang)} AS [description]`
    ].join(', ');
}

async function getCourseColumnSet(pool) {
    if (!pool) return new Set();
    if (!_courseColsPromise) {
        _courseColsPromise = (async () => {
            const set = new Set();
            try {
                const probes = TEXT_COLS.map(
                    (col, i) => `CASE WHEN COL_LENGTH('dbo.courses', '${col}') IS NOT NULL THEN 1 ELSE 0 END AS c${i}`
                ).join(', ');
                const r = await pool.request().query(`SELECT ${probes}`);
                const row = (r.recordset && r.recordset[0]) || {};
                TEXT_COLS.forEach((col, i) => {
                    if (Number(row[`c${i}`]) === 1) set.add(col);
                });
            } catch (err) {
                console.warn('⚠️ getCourseColumnSet:', err.message);
            }
            // Current production schema is bilingual-only — default to those cols if probe empty
            if (![...set].some((c) => c.endsWith('_th') || c.endsWith('_en'))) {
                BILINGUAL_COLS.forEach((c) => set.add(c));
            }
            return set;
        })();
    }
    return _courseColsPromise;
}

/**
 * SELECT list for course text.
 * Always selects physical *_th/*_en and aliases course_name/instructor_name/description
 * via COALESCE for the active language — never references missing legacy columns.
 */
function courseTextSelectFromCols(alias = 'c', cols, lang = 'th') {
    const a = alias ? `${alias}.` : '';
    const set = cols instanceof Set ? cols : new Set(cols || []);
    const hasBilingual = !set.size
        || set.has('course_name_th')
        || set.has('course_name_en')
        || set.has('instructor_name_th');

    if (!hasBilingual && (set.has('course_name') || set.has('instructor_name'))) {
        return courseLegacySelect(alias);
    }

    const parts = BILINGUAL_COLS.map((col) => `${a}[${col}] AS [${col}]`);
    parts.push(`${displayExpr(alias, 'course_name', lang)} AS [course_name]`);
    parts.push(`${displayExpr(alias, 'instructor_name', lang)} AS [instructor_name]`);
    parts.push(`${displayExpr(alias, 'description', lang)} AS [description]`);
    return parts.join(',\n                    ');
}

function courseBilingualSelect(alias = 'c', lang = 'th') {
    return courseTextSelectFromCols(alias, new Set(BILINGUAL_COLS), lang);
}

function courseLegacySelect(alias = 'c') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}[course_name] AS [course_name_th]`,
        `CAST(NULL AS NVARCHAR(255)) AS [course_name_en]`,
        `${a}[instructor_name] AS [instructor_name_th]`,
        `CAST(NULL AS NVARCHAR(255)) AS [instructor_name_en]`,
        `${a}[description] AS [description_th]`,
        `CAST(NULL AS NVARCHAR(MAX)) AS [description_en]`,
        `${a}[course_name] AS [course_name]`,
        `${a}[instructor_name] AS [instructor_name]`,
        `${a}[description] AS [description]`
    ].join(',\n                    ');
}

function isMissingBilingualColumnError(err) {
    const msg = String((err && err.message) || err || '');
    return /Invalid column name/i.test(msg);
}

async function resolveCourseTextMode(pool) {
    const cols = await getCourseColumnSet(pool);
    if (cols.has('course_name_th') || cols.has('course_name_en')
        || cols.has('instructor_name_th') || cols.has('description_th')) {
        return 'bilingual';
    }
    return 'legacy';
}

function courseTextSelect(alias = 'c', lang = 'th', mode = 'bilingual') {
    return mode === 'bilingual'
        ? courseBilingualSelect(alias, lang)
        : courseLegacySelect(alias);
}

function resetCourseTextModeCache() {
    _courseColsPromise = null;
}

function courseNameSelect(alias = 'c', lang = 'th') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}[course_name_th] AS [course_name_th]`,
        `${a}[course_name_en] AS [course_name_en]`,
        `${displayExpr(alias, 'course_name', lang)} AS [course_name]`
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
        // convenience mirrors for older callers (not physical DB cols)
        course_name: nameTh,
        instructor_name: instructorTh,
        description: descTh
    };
}

module.exports = {
    resolveLang,
    resolveLangFromReq,
    normText,
    fieldFromRow,
    pickText,
    localizeCourseRow,
    localizeCourseRows,
    TEXT_COLS,
    BILINGUAL_COLS,
    getCourseColumnSet,
    courseTextSelectFromCols,
    courseBilingualSelect,
    courseLegacySelect,
    courseTextSelect,
    courseDisplaySelect,
    displayExpr,
    resolveCourseTextMode,
    resetCourseTextModeCache,
    isMissingBilingualColumnError,
    courseNameSelect,
    normalizeCourseBody
};
