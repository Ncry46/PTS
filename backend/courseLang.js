/**
 * Course bilingual helpers.
 * Prefer course_name_th / instructor_name_th / description_th (default),
 * and *_en when UI language is English.
 *
 * Always populate convenience fields course_name / instructor_name / description
 * so older frontend cards that only read those keys never show "-".
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
    const want = String(name).toLowerCase();
    if (Object.prototype.hasOwnProperty.call(row, name)) {
        const direct = normText(row[name]);
        if (direct) return direct;
    }
    const map = rowKeyMap(row);
    return normText(map[want]);
}

/** Scan row for any key that looks like the field (driver/casing quirks). */
function looseField(row, patterns) {
    if (!row) return '';
    for (const key of Object.keys(row)) {
        const lk = String(key).toLowerCase();
        for (const re of patterns) {
            if (re.test(lk)) {
                const v = normText(row[key]);
                if (v) return v;
            }
        }
    }
    return '';
}

function pickText(row, base, lang) {
    if (!row) return '';
    const l = resolveLang(lang);
    let th = fieldFromRow(row, `${base}_th`);
    let en = fieldFromRow(row, `${base}_en`);
    let legacy = fieldFromRow(row, base);

    if (!th || !en || !legacy) {
        if (base === 'course_name') {
            if (!th) th = looseField(row, [/^course_?name_?th$/i]);
            if (!en) en = looseField(row, [/^course_?name_?en$/i]);
            if (!legacy) legacy = looseField(row, [/^course_?name$/i]);
        } else if (base === 'instructor_name') {
            if (!th) th = looseField(row, [/^instructor_?name_?th$/i]);
            if (!en) en = looseField(row, [/^instructor_?name_?en$/i]);
            if (!legacy) legacy = looseField(row, [/^instructor_?name$/i, /^instructor$/i]);
        } else if (base === 'description') {
            if (!th) th = looseField(row, [/^description_?th$/i]);
            if (!en) en = looseField(row, [/^description_?en$/i]);
            if (!legacy) legacy = looseField(row, [/^description$/i]);
        }
    }

    if (l === 'en') return en || th || legacy || '';
    return th || legacy || en || '';
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

    out.course_name_th = fieldFromRow(row, 'course_name_th')
        || looseField(row, [/^course_?name_?th$/i])
        || fieldFromRow(row, 'course_name')
        || null;
    out.course_name_en = fieldFromRow(row, 'course_name_en')
        || looseField(row, [/^course_?name_?en$/i])
        || null;
    out.instructor_name_th = fieldFromRow(row, 'instructor_name_th')
        || looseField(row, [/^instructor_?name_?th$/i])
        || fieldFromRow(row, 'instructor_name')
        || null;
    out.instructor_name_en = fieldFromRow(row, 'instructor_name_en')
        || looseField(row, [/^instructor_?name_?en$/i])
        || null;
    out.description_th = fieldFromRow(row, 'description_th')
        || fieldFromRow(row, 'description')
        || null;
    out.description_en = fieldFromRow(row, 'description_en') || null;

    out.course_name = pickText(out, 'course_name', l)
        || firstNonEmpty(out.course_name_th, out.course_name_en, fieldFromRow(row, 'course_name'))
        || '';
    out.instructor_name = pickText(out, 'instructor_name', l)
        || firstNonEmpty(out.instructor_name_th, out.instructor_name_en, fieldFromRow(row, 'instructor_name'))
        || '';
    out.description = pickText(out, 'description', l)
        || firstNonEmpty(out.description_th, out.description_en, fieldFromRow(row, 'description'))
        || '';
    out._lang = l;
    return out;
}

function localizeCourseRows(rows, lang) {
    if (!Array.isArray(rows)) return rows;
    return rows.map((r) => localizeCourseRow(r, lang));
}

const TEXT_COLS = [
    'course_name_th',
    'course_name_en',
    'instructor_name_th',
    'instructor_name_en',
    'description_th',
    'description_en',
    'course_name',
    'instructor_name',
    'description'
];

let _courseColsPromise = null;

function sqlNz(expr, isMax = false) {
    if (isMax) {
        return `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), ${expr}))), N'')`;
    }
    return `NULLIF(LTRIM(RTRIM(${expr})), N'')`;
}

function coalesceDisplay(alias, cols, base, lang) {
    const a = alias ? `${alias}.` : '';
    const set = cols instanceof Set ? cols : new Set(cols || []);
    const has = (c) => set.size === 0 || set.has(c);
    const isMax = base === 'description';
    const th = `${base}_th`;
    const en = `${base}_en`;
    const order = resolveLang(lang) === 'en'
        ? [en, th, base]
        : [th, base, en];
    const parts = [];
    for (const col of order) {
        if (has(col)) parts.push(sqlNz(`${a}[${col}]`, isMax));
    }
    if (!parts.length) {
        const typ = isMax ? 'NVARCHAR(MAX)' : 'NVARCHAR(255)';
        return `CAST(NULL AS ${typ})`;
    }
    return `COALESCE(${parts.join(', ')})`;
}

/**
 * Detect real dbo.courses text columns via COL_LENGTH (reliable) + INFORMATION_SCHEMA.
 */
async function getCourseColumnSet(pool) {
    if (!pool) return new Set();
    if (!_courseColsPromise) {
        _courseColsPromise = (async () => {
            const set = new Set();
            try {
                // COL_LENGTH is the most reliable check for known bilingual columns
                const probes = TEXT_COLS.map(
                    (col, i) => `CASE WHEN COL_LENGTH('dbo.courses', '${col}') IS NOT NULL THEN 1 ELSE 0 END AS c${i}`
                ).join(',\n                    ');
                const r = await pool.request().query(`SELECT ${probes}`);
                const row = (r.recordset && r.recordset[0]) || {};
                TEXT_COLS.forEach((col, i) => {
                    if (Number(row[`c${i}`]) === 1) set.add(col);
                });
            } catch (err) {
                console.warn('⚠️ getCourseColumnSet COL_LENGTH:', err.message);
            }
            try {
                const r2 = await pool.request().query(`
                    SELECT COLUMN_NAME
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = N'dbo' AND LOWER(TABLE_NAME) = N'courses'
                `);
                for (const row of r2.recordset || []) {
                    const name = String(row.COLUMN_NAME || '').trim().toLowerCase();
                    if (name) set.add(name);
                }
            } catch (err) {
                console.warn('⚠️ getCourseColumnSet INFORMATION_SCHEMA:', err.message);
            }
            return set;
        })();
    }
    return _courseColsPromise;
}

/**
 * Build SELECT list from columns that actually exist.
 * Display keys (course_name / instructor_name / description) are COALESCE'd
 * from th → legacy → en (or en-first when lang=en) so the UI never gets blanks
 * when any language column has data.
 */
function courseTextSelectFromCols(alias = 'c', cols, lang = 'th') {
    const a = alias ? `${alias}.` : '';
    const set = cols instanceof Set ? cols : new Set(cols || []);
    // Empty set ⇒ assume bilingual columns exist (caller must try/catch → legacy)
    const assumeAll = set.size === 0;
    const parts = [];

    for (const col of [
        'course_name_th',
        'course_name_en',
        'instructor_name_th',
        'instructor_name_en',
        'description_th',
        'description_en'
    ]) {
        if (assumeAll || set.has(col)) {
            parts.push(`${a}[${col}] AS [${col}]`);
        } else {
            const typ = col.startsWith('description') ? 'NVARCHAR(MAX)' : 'NVARCHAR(255)';
            parts.push(`CAST(NULL AS ${typ}) AS [${col}]`);
        }
    }

    // Always emit convenience display fields for older FE that only reads course_name
    parts.push(`${coalesceDisplay(alias, set, 'course_name', lang)} AS [course_name]`);
    parts.push(`${coalesceDisplay(alias, set, 'instructor_name', lang)} AS [instructor_name]`);
    parts.push(`${coalesceDisplay(alias, set, 'description', lang)} AS [description]`);

    return parts.join(',\n                    ');
}

/** Bilingual select with COALESCE display fields (Thai-first unless lang=en). */
function courseBilingualSelect(alias = 'c', lang = 'th') {
    // Empty set ⇒ coalesceDisplay / select assumes all TEXT_COLS exist
    return courseTextSelectFromCols(alias, new Set(), lang);
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

function courseNameSelect(alias = 'c') {
    const a = alias ? `${alias}.` : '';
    return [
        `${a}[course_name_th] AS [course_name_th]`,
        `${a}[course_name_en] AS [course_name_en]`,
        `COALESCE(${sqlNz(`${a}[course_name_th]`)}, ${sqlNz(`${a}[course_name]`)}, ${sqlNz(`${a}[course_name_en]`)}) AS [course_name]`
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

module.exports = {
    resolveLang,
    resolveLangFromReq,
    normText,
    fieldFromRow,
    pickText,
    localizeCourseRow,
    localizeCourseRows,
    TEXT_COLS,
    getCourseColumnSet,
    courseTextSelectFromCols,
    courseBilingualSelect,
    courseLegacySelect,
    courseTextSelect,
    resolveCourseTextMode,
    resetCourseTextModeCache,
    isMissingBilingualColumnError,
    courseNameSelect,
    normalizeCourseBody
};
