/**
 * Course bilingual helpers for BD_PTS.dbo.courses
 *
 * Physical columns ONLY:
 *   course_name_th / course_name_en
 *   instructor_name_th / instructor_name_en
 *   description_th / description_en
 *
 * Default = Thai (*_th). English UI = *_en (fallback Thai).
 * Always also sets course_name / instructor_name / description for older UI.
 */

const COURSE_API_VERSION = '2026-08-10-names-v4';

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
        const utf8 = value.toString('utf8').replace(/\u0000/g, '').trim();
        if (utf8) return utf8;
        const utf16 = value.toString('utf16le').replace(/\u0000/g, '').trim();
        return utf16;
    }
    if (typeof value === 'object') {
        // mssql sometimes wraps; pull common shapes
        if (typeof value.valueOf === 'function') {
            const v = value.valueOf();
            if (v !== value) return normText(v);
        }
        if (Object.prototype.hasOwnProperty.call(value, 'value')) {
            return normText(value.value);
        }
    }
    return String(value).replace(/\u0000/g, '').trim();
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
    for (const key of Object.keys(row)) {
        if (String(key).toLowerCase() === want) {
            const v = normText(row[key]);
            if (v) return v;
        }
    }
    return '';
}

function pickText(row, base, lang) {
    if (!row) return '';
    const l = resolveLang(lang);
    const th = fieldFromRow(row, `${base}_th`);
    const en = fieldFromRow(row, `${base}_en`);
    const legacy = fieldFromRow(row, base);
    if (l === 'en') return en || th || legacy || '';
    return th || en || legacy || '';
}

function firstNonEmpty(...vals) {
    for (const v of vals) {
        if (v === undefined || v === null) continue;
        const s = normText(v);
        if (s) return s;
    }
    return null;
}

/** Flatten mssql row into a plain JSON-safe object. */
function plainRow(row) {
    if (!row || typeof row !== 'object') return {};
    const out = {};
    for (const key of Object.keys(row)) {
        const v = row[key];
        if (v == null) {
            out[key] = null;
        } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(v)) {
            out[key] = normText(v) || null;
        } else if (v instanceof Date) {
            out[key] = v.toISOString();
        } else if (typeof v === 'object' && typeof v.toISOString === 'function') {
            try { out[key] = v.toISOString(); } catch (_) { out[key] = normText(v) || null; }
        } else if (typeof v === 'bigint') {
            out[key] = Number(v);
        } else {
            out[key] = v;
        }
    }
    return out;
}

function localizeCourseRow(row, lang) {
    if (!row || typeof row !== 'object') return row;
    const l = resolveLang(lang);
    const out = plainRow(row);

    out.course_name_th = fieldFromRow(out, 'course_name_th') || null;
    out.course_name_en = fieldFromRow(out, 'course_name_en') || null;
    out.instructor_name_th = fieldFromRow(out, 'instructor_name_th') || null;
    out.instructor_name_en = fieldFromRow(out, 'instructor_name_en') || null;
    out.description_th = fieldFromRow(out, 'description_th') || null;
    out.description_en = fieldFromRow(out, 'description_en') || null;

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
 * Explicit SELECT for BD_PTS.dbo.courses bilingual schema.
 * Forces NVARCHAR conversion + COALESCE display aliases.
 */
function courseListTextSql(alias = 'c', lang = 'th') {
    const a = alias ? `${alias}.` : '';
    const l = resolveLang(lang);
    const nameTh = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), ${a}[course_name_th]))), N'')`;
    const nameEn = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), ${a}[course_name_en]))), N'')`;
    const instTh = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), ${a}[instructor_name_th]))), N'')`;
    const instEn = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), ${a}[instructor_name_en]))), N'')`;
    const descTh = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), ${a}[description_th]))), N'')`;
    const descEn = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), ${a}[description_en]))), N'')`;
    const name = l === 'en' ? `COALESCE(${nameEn}, ${nameTh})` : `COALESCE(${nameTh}, ${nameEn})`;
    const inst = l === 'en' ? `COALESCE(${instEn}, ${instTh})` : `COALESCE(${instTh}, ${instEn})`;
    const desc = l === 'en' ? `COALESCE(${descEn}, ${descTh})` : `COALESCE(${descTh}, ${descEn})`;

    return `
                    CONVERT(NVARCHAR(255), ${a}[course_name_th]) AS [course_name_th],
                    CONVERT(NVARCHAR(255), ${a}[course_name_en]) AS [course_name_en],
                    CONVERT(NVARCHAR(255), ${a}[instructor_name_th]) AS [instructor_name_th],
                    CONVERT(NVARCHAR(255), ${a}[instructor_name_en]) AS [instructor_name_en],
                    CONVERT(NVARCHAR(MAX), ${a}[description_th]) AS [description_th],
                    CONVERT(NVARCHAR(MAX), ${a}[description_en]) AS [description_en],
                    ${name} AS [course_name],
                    ${inst} AS [instructor_name],
                    ${desc} AS [description]
    `.trim();
}

function courseMetaSelectSql(alias = 'c') {
    const a = alias ? `${alias}.` : '';
    // Outer row reference for the correlated category-name subqueries.
    // Must be table-qualified: with alias '' an unqualified name would
    // resolve to the inner coursescat table instead of dbo.courses.
    const idRef = alias ? `${alias}.[coursescat_id]` : `dbo.courses.[coursescat_id]`;
    return `
                    ${a}[course_id] AS [course_id],
                    ${a}[coursescat_id] AS [coursescat_id],
                    (SELECT TOP 1 cc.[coursescat_name_th] FROM dbo.coursescat cc WHERE cc.[coursescat_id] = ${idRef}) AS [coursescat_name_th],
                    (SELECT TOP 1 cc.[coursescat_name_en] FROM dbo.coursescat cc WHERE cc.[coursescat_id] = ${idRef}) AS [coursescat_name_en],
                    ${a}[delivery_mode] AS [delivery_mode],
                    ${a}[total_hours] AS [total_hours],
                    ${a}[price] AS [price],
                    ${a}[cover_image_url] AS [cover_image_url],
                    ${a}[average_rating] AS [average_rating],
                    ${a}[total_reviews] AS [total_reviews],
                    ${a}[total_enrolled] AS [total_enrolled],
                    ${a}[is_featured] AS [is_featured],
                    ${a}[is_open_soon] AS [is_open_soon],
                    ${a}[coursesFlag] AS [coursesFlag],
                    ${a}[flag_use] AS [flag_use],
                    ${a}[start_date] AS [start_date],
                    ${a}[created_at] AS [created_at]
    `.trim();
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

function isMissingBilingualColumnError(err) {
    const msg = String((err && err.message) || err || '');
    return /Invalid column name/i.test(msg);
}

module.exports = {
    COURSE_API_VERSION,
    resolveLang,
    resolveLangFromReq,
    normText,
    fieldFromRow,
    pickText,
    plainRow,
    localizeCourseRow,
    localizeCourseRows,
    courseListTextSql,
    courseMetaSelectSql,
    normalizeCourseBody,
    isMissingBilingualColumnError,
    // back-compat exports used elsewhere
    displayExpr: (alias, base, lang) => {
        const a = alias ? `${alias}.` : '';
        const isMax = base === 'description';
        const typ = isMax ? 'NVARCHAR(MAX)' : 'NVARCHAR(255)';
        const th = `NULLIF(LTRIM(RTRIM(CONVERT(${typ}, ${a}[${base}_th]))), N'')`;
        const en = `NULLIF(LTRIM(RTRIM(CONVERT(${typ}, ${a}[${base}_en]))), N'')`;
        return resolveLang(lang) === 'en' ? `COALESCE(${en}, ${th})` : `COALESCE(${th}, ${en})`;
    },
    courseNameSelect: (alias = 'c', lang = 'th') => {
        const a = alias ? `${alias}.` : '';
        const l = resolveLang(lang);
        const nameTh = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), ${a}[course_name_th]))), N'')`;
        const nameEn = `NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), ${a}[course_name_en]))), N'')`;
        const name = l === 'en' ? `COALESCE(${nameEn}, ${nameTh})` : `COALESCE(${nameTh}, ${nameEn})`;
        return [
            `CONVERT(NVARCHAR(255), ${a}[course_name_th]) AS [course_name_th]`,
            `CONVERT(NVARCHAR(255), ${a}[course_name_en]) AS [course_name_en]`,
            `${name} AS [course_name]`
        ].join(', ');
    },
    courseBilingualSelect: (alias = 'c', lang = 'th') => courseListTextSql(alias, lang),
    courseTextSelectFromCols: (alias = 'c', _cols, lang = 'th') => courseListTextSql(alias, lang),
    courseLegacySelect: (alias = 'c') => {
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
    },
    courseTextSelect: (alias = 'c', lang = 'th') => courseListTextSql(alias, lang),
    getCourseColumnSet: async () => new Set([
        'course_name_th', 'course_name_en',
        'instructor_name_th', 'instructor_name_en',
        'description_th', 'description_en'
    ]),
    resolveCourseTextMode: async () => 'bilingual',
    resetCourseTextModeCache: () => {},
    TEXT_COLS: [
        'course_name_th', 'course_name_en',
        'instructor_name_th', 'instructor_name_en',
        'description_th', 'description_en'
    ],
    BILINGUAL_COLS: [
        'course_name_th', 'course_name_en',
        'instructor_name_th', 'instructor_name_en',
        'description_th', 'description_en'
    ]
};
