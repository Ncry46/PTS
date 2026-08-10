const { flagActiveSql, setFlagUse, bindFlagInput, isFlagActive } = require('./db');
const express = require('express');
const sql = require('mssql');

const QUESTION_TYPES = new Set([
    'text', 'textarea', 'number', 'email', 'phone', 'date',
    'select', 'radio', 'checkbox', 'yesno'
]);

const FORM_TYPES = new Set(['general', 'disc', 'course']);

const DISC_META = {
    D: { code: 'D', animal: 'กระทิง', label: 'D : กระทิง' },
    I: { code: 'I', animal: 'อินทรี', label: 'I : อินทรี' },
    S: { code: 'S', animal: 'หนู', label: 'S : หนู' },
    C: { code: 'C', animal: 'หมี', label: 'C : หมี' },
    U: { code: 'U', animal: 'ยังไม่ทราบ', label: 'U : ยังไม่ทราบ' }
};

const DISC_OPTION_LABELS = [
    DISC_META.D.label,
    DISC_META.I.label,
    DISC_META.S.label,
    DISC_META.C.label,
    DISC_META.U.label
];

function parseOptions(raw) {
    if (raw == null || raw === '') return [];
    if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch (_) { /* fall through */ }
    return String(raw)
        .split(/\n|,/)
        .map((x) => x.trim())
        .filter(Boolean);
}

function optionsToJson(raw) {
    const list = parseOptions(raw);
    return list.length ? JSON.stringify(list) : null;
}

function mapQuestion(row) {
    return {
        question_id: row.question_id,
        form_id: row.form_id,
        label: row.label,
        help_text: row.help_text || '',
        question_type: row.question_type,
        options: parseOptions(row.options_json),
        options_json: row.options_json || null,
        is_required: !!row.is_required,
        sort_order: row.sort_order,
        flag_use: row.flag_use
    };
}

function normalizeFormType(value) {
    const t = String(value || 'general').trim().toLowerCase();
    return FORM_TYPES.has(t) ? t : 'general';
}

function parseDiscCode(raw) {
    const text = String(raw || '').trim();
    if (!text) return null;
    const upper = text.toUpperCase();
    if (/^D\b|^D\s*:|กระทิง/.test(text) || upper.startsWith('D')) return 'D';
    if (/^I\b|^I\s*:|อินทร[ีิ]์?/.test(text) || upper.startsWith('I')) return 'I';
    if (/^S\b|^S\s*:|หนู/.test(text) || upper.startsWith('S')) return 'S';
    if (/^C\b|^C\s*:|หมี/.test(text) || upper.startsWith('C')) return 'C';
    if (/ยังไม่ทราบ|^U\b|^U\s*:/i.test(text) || upper.startsWith('U')) return 'U';
    return null;
}

function scoreDiscAnswers(answerValues) {
    const scores = { D: 0, I: 0, S: 0, C: 0, U: 0 };
    for (const raw of answerValues) {
        const parts = Array.isArray(raw)
            ? raw
            : String(raw || '').split(',').map((x) => x.trim()).filter(Boolean);
        for (const part of parts) {
            const code = parseDiscCode(part);
            if (code && scores[code] != null) scores[code] += 1;
        }
    }
    const ranked = ['D', 'I', 'S', 'C']
        .map((code) => ({ code, n: scores[code] }))
        .sort((a, b) => b.n - a.n);
    let winner = 'U';
    if (ranked[0].n > 0 && ranked[0].n > ranked[1].n) {
        winner = ranked[0].code;
    }
    const meta = DISC_META[winner] || DISC_META.U;
    return {
        result_code: meta.code,
        result_label: meta.animal,
        result_display: meta.label,
        scores
    };
}

async function findRequiredCourseForm(pool, userId, courseId) {
    const result = await pool.request()
        .input('courseId', sql.Int, courseId)
        .input('userId', sql.Int, userId)
        .query(`
            SELECT TOP 1
                f.form_id, f.section_title,
                (SELECT TOP 1 r.response_id
                 FROM dbo.custom_form_responses r
                 WHERE r.form_id = f.form_id AND r.user_id = @userId
                 ORDER BY r.submitted_at DESC) AS my_response_id
            FROM dbo.custom_forms f
            WHERE ${flagActiveSql('f.flag_use')}
              AND ISNULL(f.is_published,0)=1
              AND ISNULL(f.form_type,'general') = 'course'
              AND f.course_id = @courseId
            ORDER BY f.updated_at DESC, f.form_id DESC
        `);
    const row = result.recordset[0];
    if (!row) return null;
    if (row.my_response_id) return null;
    return { form_id: row.form_id, section_title: row.section_title || row.title };
}

function createFormRouter({ poolPromise, requireLogin }) {
    const router = express.Router();

    router.get('/forms', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const pool = await poolPromise;
            const typeFilter = String(req.query.type || '').trim().toLowerCase();
            const courseId = Number(req.query.course_id) || null;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT
                        f.form_id, f.section_title, f.description, f.allow_resubmit, f.updated_at, f.created_at,
                        ISNULL(f.form_type, 'general') AS form_type,
                        f.course_id,
                        c.course_name_th, c.course_name_en,
                        COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), c.course_name) AS course_name,
                        (SELECT COUNT(*) FROM dbo.custom_form_questions q
                         WHERE q.form_id = f.form_id AND ${flagActiveSql('q.flag_use')}) AS question_count,
                        (SELECT TOP 1 r.response_id
                         FROM dbo.custom_form_responses r
                         WHERE r.form_id = f.form_id AND r.user_id = @userId
                         ORDER BY r.submitted_at DESC) AS my_response_id,
                        (SELECT TOP 1 r.submitted_at
                         FROM dbo.custom_form_responses r
                         WHERE r.form_id = f.form_id AND r.user_id = @userId
                         ORDER BY r.submitted_at DESC) AS my_submitted_at,
                        (SELECT TOP 1 r.result_code
                         FROM dbo.custom_form_responses r
                         WHERE r.form_id = f.form_id AND r.user_id = @userId
                         ORDER BY r.submitted_at DESC) AS my_result_code,
                        (SELECT TOP 1 r.result_label
                         FROM dbo.custom_form_responses r
                         WHERE r.form_id = f.form_id AND r.user_id = @userId
                         ORDER BY r.submitted_at DESC) AS my_result_label
                    FROM dbo.custom_forms f
                    LEFT JOIN dbo.courses_main c ON c.course_id = f.course_id
                    WHERE ${flagActiveSql('f.flag_use')} AND ISNULL(f.is_published,0)=1
                      AND (@courseId IS NULL OR f.course_id = @courseId)
                    ORDER BY
                        CASE ISNULL(f.form_type,'general')
                            WHEN 'disc' THEN 0
                            WHEN 'course' THEN 1
                            ELSE 2
                        END,
                        f.updated_at DESC, f.form_id DESC
                `);
            let rows = result.recordset || [];
            if (typeFilter && FORM_TYPES.has(typeFilter)) {
                rows = rows.filter((r) => String(r.form_type || 'general') === typeFilter);
            }
            res.json({ success: true, data: rows, disc_animals: DISC_META });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/forms/course/:courseId/required', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const courseId = Number(req.params.courseId);
        if (!courseId) return res.status(400).json({ success: false, message: 'course_id ไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            if ((user.role || '').toLowerCase() === 'admin') {
                return res.json({ success: true, required: false, form: null });
            }
            const form = await findRequiredCourseForm(pool, user.user_id, courseId);
            res.json({
                success: true,
                required: !!form,
                form: form || null
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/forms/:formId', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const formId = Number(req.params.formId);
        if (!formId) return res.status(400).json({ success: false, message: 'form_id ไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            const isAdmin = (user.role || '').toLowerCase() === 'admin';
            const formRes = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    SELECT f.form_id, f.section_title, f.description, f.is_published, f.allow_resubmit,
                           f.flag_use, f.updated_at, ISNULL(f.form_type,'general') AS form_type,
                           f.course_id, c.course_name
                    FROM dbo.custom_forms f
                    LEFT JOIN dbo.courses_main c ON c.course_id = f.course_id
                    WHERE f.form_id = @formId AND ${flagActiveSql('f.flag_use')}
                `);
            const form = formRes.recordset[0];
            if (!form) return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });
            if (!form.is_published && !isAdmin) {
                return res.status(403).json({ success: false, message: 'แบบฟอร์มยังไม่เปิดให้กรอก' });
            }

            const qRes = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    SELECT question_id, form_id, label, help_text, question_type, options_json,
                           is_required, sort_order, flag_use
                    FROM dbo.custom_form_questions
                    WHERE form_id = @formId AND ${flagActiveSql('flag_use')}
                    ORDER BY sort_order ASC, question_id ASC
                `);

            const mine = await pool.request()
                .input('formId', sql.Int, formId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT TOP 1 response_id, submitted_at, result_code, result_label, result_json
                    FROM dbo.custom_form_responses
                    WHERE form_id = @formId AND user_id = @userId
                    ORDER BY submitted_at DESC
                `);

            let questions = (qRes.recordset || []).map(mapQuestion);
            if (form.form_type === 'disc') {
                questions = questions.map((q) => ({
                    ...q,
                    options: (q.options && q.options.length) ? q.options : DISC_OPTION_LABELS,
                    question_type: ['radio', 'select'].includes(q.question_type) ? q.question_type : 'radio'
                }));
            }

            res.json({
                success: true,
                data: {
                    ...form,
                    is_published: !!form.is_published,
                    allow_resubmit: !!form.allow_resubmit,
                    questions,
                    my_response: mine.recordset[0] || null,
                    disc_animals: DISC_META
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/forms/:formId/my-response', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const formId = Number(req.params.formId);
        if (!formId) return res.status(400).json({ success: false, message: 'form_id ไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            const resp = await pool.request()
                .input('formId', sql.Int, formId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT TOP 1 response_id, form_id, user_id, submitted_at,
                           result_code, result_label, result_json
                    FROM dbo.custom_form_responses
                    WHERE form_id = @formId AND user_id = @userId
                    ORDER BY submitted_at DESC
                `);
            const row = resp.recordset[0];
            if (!row) return res.json({ success: true, data: null });

            const answers = await pool.request()
                .input('responseId', sql.Int, row.response_id)
                .query(`
                    SELECT a.answer_id, a.question_id, a.answer_text, q.label, q.question_type
                    FROM dbo.custom_form_answers a
                    LEFT JOIN dbo.custom_form_questions q ON q.question_id = a.question_id
                    WHERE a.response_id = @responseId
                    ORDER BY ISNULL(q.sort_order, 999), a.question_id
                `);
            let resultJson = null;
            try { resultJson = row.result_json ? JSON.parse(row.result_json) : null; } catch (_) { /* ignore */ }
            res.json({
                success: true,
                data: {
                    ...row,
                    result_json: resultJson,
                    answers: answers.recordset || [],
                    disc_animals: DISC_META
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/forms/:formId/submit', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const formId = Number(req.params.formId);
        if (!formId) return res.status(400).json({ success: false, message: 'form_id ไม่ถูกต้อง' });

        const answersIn = Array.isArray(req.body?.answers) ? req.body.answers : null;
        if (!answersIn) {
            return res.status(400).json({ success: false, message: 'กรุณาส่งคำตอบเป็น answers[]' });
        }

        try {
            const pool = await poolPromise;
            const formRes = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    SELECT form_id, is_published, allow_resubmit, flag_use,
                           ISNULL(form_type,'general') AS form_type, course_id
                    FROM dbo.custom_forms
                    WHERE form_id = @formId AND ${flagActiveSql('flag_use')}
                `);
            const form = formRes.recordset[0];
            if (!form) return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });
            if (!form.is_published) {
                return res.status(403).json({ success: false, message: 'แบบฟอร์มยังไม่เปิดให้กรอก' });
            }

            const existing = await pool.request()
                .input('formId', sql.Int, formId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT TOP 1 response_id
                    FROM dbo.custom_form_responses
                    WHERE form_id = @formId AND user_id = @userId
                    ORDER BY submitted_at DESC
                `);
            if (existing.recordset[0] && !form.allow_resubmit) {
                return res.status(409).json({
                    success: false,
                    message: 'คุณส่งแบบฟอร์มนี้แล้ว และไม่อนุญาตให้ส่งซ้ำ'
                });
            }

            const qRes = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    SELECT question_id, label, question_type, options_json, is_required
                    FROM dbo.custom_form_questions
                    WHERE form_id = @formId AND ${flagActiveSql('flag_use')}
                `);
            const questions = qRes.recordset || [];
            const byId = new Map(questions.map((q) => [Number(q.question_id), q]));
            const answerMap = new Map();
            for (const a of answersIn) {
                const qid = Number(a.question_id);
                if (!qid || !byId.has(qid)) continue;
                let value = a.value;
                if (Array.isArray(value)) value = value.map((x) => String(x).trim()).filter(Boolean).join(', ');
                else if (value == null) value = '';
                else value = String(value).trim();
                answerMap.set(qid, value);
            }

            for (const q of questions) {
                const val = answerMap.get(Number(q.question_id)) || '';
                if (q.is_required && !val) {
                    return res.status(400).json({
                        success: false,
                        message: `กรุณากรอก: ${q.label}`
                    });
                }
            }

            let discResult = null;
            if (form.form_type === 'disc') {
                discResult = scoreDiscAnswers(questions.map((q) => answerMap.get(Number(q.question_id)) || ''));
            }

            const inserted = await pool.request()
                .input('formId', sql.Int, formId)
                .input('userId', sql.Int, user.user_id)
                .input('resultCode', sql.VarChar, discResult ? discResult.result_code : null)
                .input('resultLabel', sql.NVarChar, discResult ? discResult.result_label : null)
                .input('resultJson', sql.NVarChar, discResult ? JSON.stringify(discResult) : null)
                .query(`
                    INSERT INTO dbo.custom_form_responses
                        (form_id, user_id, result_code, result_label, result_json)
                    OUTPUT INSERTED.response_id, INSERTED.submitted_at, INSERTED.result_code, INSERTED.result_label
                    VALUES (@formId, @userId, @resultCode, @resultLabel, @resultJson)
                `);
            const responseId = inserted.recordset[0].response_id;

            for (const q of questions) {
                const val = answerMap.get(Number(q.question_id)) || '';
                await pool.request()
                    .input('responseId', sql.Int, responseId)
                    .input('questionId', sql.Int, q.question_id)
                    .input('answerText', sql.NVarChar, val)
                    .query(`
                        INSERT INTO dbo.custom_form_answers (response_id, question_id, answer_text)
                        VALUES (@responseId, @questionId, @answerText)
                    `);
            }

            if (discResult) {
                try {
                    await pool.request()
                        .input('userId', sql.Int, user.user_id)
                        .input('code', sql.VarChar, discResult.result_code)
                        .input('label', sql.NVarChar, discResult.result_label)
                        .query(`
                            UPDATE dbo.users_main
                            SET disc_code = @code, disc_label = @label, disc_updated_at = GETDATE()
                            WHERE user_id = @userId
                        `);
                    if (req.session && req.session.user) {
                        req.session.user.disc_code = discResult.result_code;
                        req.session.user.disc_label = discResult.result_label;
                    }
                } catch (err) {
                    console.warn('[forms] save disc to user:', err.message);
                }
            }

            res.json({
                success: true,
                message: form.form_type === 'disc'
                    ? `ส่งแบบประเมินสำเร็จ — สไตล์ของคุณคือ ${discResult.result_display}`
                    : 'ส่งแบบฟอร์มสำเร็จ',
                data: {
                    response_id: responseId,
                    submitted_at: inserted.recordset[0].submitted_at,
                    form_type: form.form_type,
                    course_id: form.course_id,
                    disc: discResult
                }
            });
        } catch (error) {
            console.error('❌ form submit:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

function createAdminFormRouter({ poolPromise, requireLogin }) {
    const router = express.Router();

    function requireAdmin(req, res) {
        const user = requireLogin(req, res);
        if (!user) return null;
        if ((user.role || '').toLowerCase() !== 'admin') {
            res.status(403).json({ success: false, message: 'สำหรับผู้ดูแลระบบเท่านั้น' });
            return null;
        }
        return user;
    }

    router.get('/forms', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT
                    f.form_id, f.section_title, f.description, f.is_published, f.allow_resubmit,
                    f.flag_use, f.created_by, f.created_at, f.updated_at,
                    ISNULL(f.form_type,'general') AS form_type,
                    f.course_id, c.course_name_th, c.course_name_en,
                        COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), c.course_name) AS course_name,
                    (SELECT COUNT(*) FROM dbo.custom_form_questions q
                     WHERE q.form_id = f.form_id AND ${flagActiveSql('q.flag_use')}) AS question_count,
                    (SELECT COUNT(*) FROM dbo.custom_form_responses r
                     WHERE r.form_id = f.form_id) AS response_count
                FROM dbo.custom_forms f
                LEFT JOIN dbo.courses_main c ON c.course_id = f.course_id
                WHERE ${flagActiveSql('f.flag_use')}
                ORDER BY f.updated_at DESC, f.form_id DESC
            `);
            res.json({ success: true, data: result.recordset || [], disc_animals: DISC_META });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/forms', async (req, res) => {
        const admin = requireAdmin(req, res);
        if (!admin) return;
        const section_title = String(req.body?.section_title || req.body?.title || '').trim();
        if (!section_title) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแบบฟอร์ม' });
        const formType = normalizeFormType(req.body?.form_type);
        let courseId = req.body?.course_id != null && req.body?.course_id !== ''
            ? Number(req.body.course_id)
            : null;
        if (formType === 'course' && !courseId) {
            return res.status(400).json({ success: false, message: 'แบบฟอร์มก่อนเริ่มคอร์สต้องเลือกหลักสูตร' });
        }
        if (formType !== 'course') courseId = null;
        try {
            const pool = await poolPromise;
            if (courseId) {
                const c = await pool.request()
                    .input('courseId', sql.Int, courseId)
                    .query(`SELECT course_id FROM dbo.courses_main WHERE course_id=@courseId`);
                if (!c.recordset[0]) {
                    return res.status(400).json({ success: false, message: 'ไม่พบหลักสูตรที่เลือก' });
                }
            }
            const result = await pool.request()
                .input('section_title', sql.NVarChar, section_title)
                .input('description', sql.NVarChar, String(req.body?.description || '').trim() || null)
                .input('published', sql.Bit, req.body?.is_published ? 1 : 0)
                .input('resubmit', sql.Bit, formType === 'disc' ? 1 : (req.body?.allow_resubmit ? 1 : 0))
                .input('createdBy', sql.Int, admin.user_id)
                .input('formType', sql.VarChar, formType)
                .input('courseId', sql.Int, courseId)
                .query(`
                    INSERT INTO dbo.custom_forms
                        (section_title, description, is_published, allow_resubmit, flag_use, created_by, form_type, course_id)
                    OUTPUT INSERTED.*
                    VALUES (@section_title, @description, @published, @resubmit, 1, @createdBy, @formType, @courseId)
                `);
            res.json({ success: true, data: result.recordset[0], disc_option_labels: DISC_OPTION_LABELS });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/forms/:formId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const formId = Number(req.params.formId);
        if (!formId) return res.status(400).json({ success: false, message: 'form_id ไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            const formRes = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    SELECT f.*, ISNULL(f.form_type,'general') AS form_type, c.course_name
                    FROM dbo.custom_forms f
                    LEFT JOIN dbo.courses_main c ON c.course_id = f.course_id
                    WHERE f.form_id = @formId AND ${flagActiveSql('f.flag_use')}
                `);
            const form = formRes.recordset[0];
            if (!form) return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });

            const qRes = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    SELECT * FROM dbo.custom_form_questions
                    WHERE form_id = @formId AND ${flagActiveSql('flag_use')}
                    ORDER BY sort_order ASC, question_id ASC
                `);
            res.json({
                success: true,
                data: {
                    ...form,
                    is_published: !!form.is_published,
                    allow_resubmit: !!form.allow_resubmit,
                    questions: (qRes.recordset || []).map(mapQuestion)
                },
                disc_option_labels: DISC_OPTION_LABELS,
                disc_animals: DISC_META
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.put('/forms/:formId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const formId = Number(req.params.formId);
        if (!formId) return res.status(400).json({ success: false, message: 'form_id ไม่ถูกต้อง' });
        const body = req.body || {};
        try {
            const pool = await poolPromise;
            const cur = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`SELECT * FROM dbo.custom_forms WHERE form_id=@formId AND ${flagActiveSql('flag_use')}`);
            const row = cur.recordset[0];
            if (!row) return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });

            const formType = body.form_type != null
                ? normalizeFormType(body.form_type)
                : normalizeFormType(row.form_type);
            let courseId = row.course_id;
            if (body.course_id !== undefined) {
                courseId = body.course_id === null || body.course_id === ''
                    ? null
                    : Number(body.course_id);
            }
            if (formType === 'course' && !courseId) {
                return res.status(400).json({ success: false, message: 'แบบฟอร์มก่อนเริ่มคอร์สต้องเลือกหลักสูตร' });
            }
            if (formType !== 'course') courseId = null;

            const result = await pool.request()
                .input('formId', sql.Int, formId)
                .input('section_title', sql.NVarChar, body.section_title != null ? String(body.section_title).trim() : (body.title != null ? String(body.title).trim() : null))
                .input('description', sql.NVarChar, body.description != null ? String(body.description).trim() : null)
                .input('published', sql.Bit, body.is_published == null ? null : (body.is_published ? 1 : 0))
                .input('resubmit', sql.Bit, body.allow_resubmit == null ? null : (body.allow_resubmit ? 1 : 0))
                .input('formType', sql.VarChar, formType)
                .input('courseId', sql.Int, courseId)
                .query(`
                    UPDATE dbo.custom_forms
                    SET
                        section_title = COALESCE(@section_title, section_title),
                        description = CASE WHEN @description IS NULL THEN description ELSE @description END,
                        is_published = COALESCE(@published, is_published),
                        allow_resubmit = COALESCE(@resubmit, allow_resubmit),
                        form_type = @formType,
                        course_id = @courseId,
                        updated_at = GETDATE()
                    OUTPUT INSERTED.*
                    WHERE form_id = @formId AND ${flagActiveSql('flag_use')}
                `);
            res.json({ success: true, data: result.recordset[0] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.delete('/forms/:formId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const formId = Number(req.params.formId);
        if (!formId) return res.status(400).json({ success: false, message: 'form_id ไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            await setFlagUse(pool, {
                table: 'custom_forms',
                idColumn: 'form_id',
                idValue: formId,
                active: false,
                extraSet: 'updated_at = GETDATE(), is_published = 0'
            });
            res.json({ success: true, message: 'ลบแบบฟอร์มแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/forms/:formId/questions', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const formId = Number(req.params.formId);
        if (!formId) return res.status(400).json({ success: false, message: 'form_id ไม่ถูกต้อง' });
        const label = String(req.body?.label || '').trim();
        let questionType = String(req.body?.question_type || 'text').trim().toLowerCase();
        if (!label) return res.status(400).json({ success: false, message: 'กรุณาระบุคำถาม' });
        try {
            const pool = await poolPromise;
            const formOk = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    SELECT form_id, ISNULL(form_type,'general') AS form_type
                    FROM dbo.custom_forms
                    WHERE form_id=@formId AND ${flagActiveSql('flag_use')}
                `);
            const form = formOk.recordset[0];
            if (!form) return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });

            let optionsJson = null;
            if (form.form_type === 'disc') {
                questionType = 'radio';
                optionsJson = JSON.stringify(DISC_OPTION_LABELS);
            } else {
                if (!QUESTION_TYPES.has(questionType)) {
                    return res.status(400).json({ success: false, message: 'ประเภทคำถามไม่รองรับ' });
                }
                const needsOptions = ['select', 'radio', 'checkbox'].includes(questionType);
                optionsJson = needsOptions ? optionsToJson(req.body?.options ?? req.body?.options_json) : null;
                if (needsOptions && !optionsJson) {
                    return res.status(400).json({ success: false, message: 'กรุณาระบุตัวเลือกสำหรับคำถามประเภทนี้' });
                }
            }

            let sortOrder = Number(req.body?.sort_order);
            if (!sortOrder) {
                const max = await pool.request()
                    .input('formId', sql.Int, formId)
                    .query(`
                        SELECT ISNULL(MAX(sort_order),0)+1 AS next_sort
                        FROM dbo.custom_form_questions
                        WHERE form_id=@formId AND ${flagActiveSql('flag_use')}
                    `);
                sortOrder = Number(max.recordset[0].next_sort) || 1;
            }

            const result = await pool.request()
                .input('formId', sql.Int, formId)
                .input('label', sql.NVarChar, label)
                .input('help', sql.NVarChar, String(req.body?.help_text || '').trim() || null)
                .input('qType', sql.VarChar, questionType)
                .input('opts', sql.NVarChar, optionsJson)
                .input('req', sql.Bit, req.body?.is_required === false || req.body?.is_required === 0 ? 0 : 1)
                .input('sort', sql.Int, sortOrder)
                .query(`
                    INSERT INTO dbo.custom_form_questions
                        (form_id, label, help_text, question_type, options_json, is_required, sort_order, flag_use)
                    OUTPUT INSERTED.*
                    VALUES (@formId, @label, @help, @qType, @opts, @req, @sort, 1)
                `);

            await pool.request()
                .input('formId', sql.Int, formId)
                .query(`UPDATE dbo.custom_forms SET updated_at = GETDATE() WHERE form_id = @formId`);

            res.json({ success: true, data: mapQuestion(result.recordset[0]) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.put('/form-questions/:questionId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const questionId = Number(req.params.questionId);
        if (!questionId) return res.status(400).json({ success: false, message: 'question_id ไม่ถูกต้อง' });
        const body = req.body || {};
        try {
            const pool = await poolPromise;
            const cur = await pool.request()
                .input('questionId', sql.Int, questionId)
                .query(`
                    SELECT q.*, ISNULL(f.form_type,'general') AS form_type
                    FROM dbo.custom_form_questions q
                    INNER JOIN dbo.custom_forms f ON f.form_id = q.form_id
                    WHERE q.question_id=@questionId AND ${flagActiveSql('q.flag_use')}
                `);
            const row = cur.recordset[0];
            if (!row) return res.status(404).json({ success: false, message: 'ไม่พบคำถาม' });

            let questionType = body.question_type != null
                ? String(body.question_type).trim().toLowerCase()
                : row.question_type;
            let optionsJson = row.options_json;

            if (row.form_type === 'disc') {
                questionType = 'radio';
                optionsJson = JSON.stringify(DISC_OPTION_LABELS);
            } else {
                if (!QUESTION_TYPES.has(questionType)) {
                    return res.status(400).json({ success: false, message: 'ประเภทคำถามไม่รองรับ' });
                }
                if (body.options != null || body.options_json != null) {
                    optionsJson = optionsToJson(body.options ?? body.options_json);
                }
                if (['select', 'radio', 'checkbox'].includes(questionType) && !optionsJson) {
                    return res.status(400).json({ success: false, message: 'กรุณาระบุตัวเลือกสำหรับคำถามประเภทนี้' });
                }
                if (!['select', 'radio', 'checkbox'].includes(questionType)) {
                    optionsJson = null;
                }
            }

            const result = await pool.request()
                .input('questionId', sql.Int, questionId)
                .input('label', sql.NVarChar, body.label != null ? String(body.label).trim() : row.label)
                .input('help', sql.NVarChar, body.help_text != null ? (String(body.help_text).trim() || null) : row.help_text)
                .input('qType', sql.VarChar, questionType)
                .input('opts', sql.NVarChar, optionsJson)
                .input('req', sql.Bit, body.is_required == null ? (row.is_required ? 1 : 0) : (body.is_required ? 1 : 0))
                .input('sort', sql.Int, body.sort_order != null ? Number(body.sort_order) || row.sort_order : row.sort_order)
                .query(`
                    UPDATE dbo.custom_form_questions
                    SET label=@label, help_text=@help, question_type=@qType,
                        options_json=@opts, is_required=@req, sort_order=@sort
                    OUTPUT INSERTED.*
                    WHERE question_id=@questionId AND ${flagActiveSql('flag_use')}
                `);

            await pool.request()
                .input('formId', sql.Int, row.form_id)
                .query(`UPDATE dbo.custom_forms SET updated_at = GETDATE() WHERE form_id = @formId`);

            res.json({ success: true, data: mapQuestion(result.recordset[0]) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.delete('/form-questions/:questionId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const questionId = Number(req.params.questionId);
        if (!questionId) return res.status(400).json({ success: false, message: 'question_id ไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            const cur = await pool.request()
                .input('questionId', sql.Int, questionId)
                .query(`SELECT form_id FROM dbo.custom_form_questions WHERE question_id=@questionId`);
            if (!cur.recordset[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบคำถาม' });
            }
            await setFlagUse(pool, {
                table: 'custom_form_questions',
                idColumn: 'question_id',
                idValue: questionId,
                active: false
            });
            await pool.request()
                .input('formId', sql.Int, cur.recordset[0].form_id)
                .query(`UPDATE dbo.custom_forms SET updated_at = GETDATE() WHERE form_id = @formId`);
            res.json({ success: true, message: 'ลบคำถามแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/forms/:formId/responses', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const formId = Number(req.params.formId);
        if (!formId) return res.status(400).json({ success: false, message: 'form_id ไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    SELECT
                        r.response_id, r.form_id, r.user_id, r.submitted_at,
                        r.result_code, r.result_label,
                        u.full_name, u.email
                    FROM dbo.custom_form_responses r
                    LEFT JOIN dbo.users_main u ON u.user_id = r.user_id
                    WHERE r.form_id = @formId
                    ORDER BY r.submitted_at DESC
                `);
            res.json({ success: true, data: result.recordset || [] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/forms/:formId/responses/:responseId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const formId = Number(req.params.formId);
        const responseId = Number(req.params.responseId);
        if (!formId || !responseId) {
            return res.status(400).json({ success: false, message: 'พารามิเตอร์ไม่ถูกต้อง' });
        }
        try {
            const pool = await poolPromise;
            const resp = await pool.request()
                .input('formId', sql.Int, formId)
                .input('responseId', sql.Int, responseId)
                .query(`
                    SELECT r.response_id, r.form_id, r.user_id, r.submitted_at,
                           r.result_code, r.result_label, r.result_json,
                           u.full_name, u.email
                    FROM dbo.custom_form_responses r
                    LEFT JOIN dbo.users_main u ON u.user_id = r.user_id
                    WHERE r.response_id=@responseId AND r.form_id=@formId
                `);
            const row = resp.recordset[0];
            if (!row) return res.status(404).json({ success: false, message: 'ไม่พบคำตอบ' });

            const answers = await pool.request()
                .input('responseId', sql.Int, responseId)
                .query(`
                    SELECT a.answer_id, a.question_id, a.answer_text, q.label, q.question_type, q.sort_order
                    FROM dbo.custom_form_answers a
                    LEFT JOIN dbo.custom_form_questions q ON q.question_id = a.question_id
                    WHERE a.response_id = @responseId
                    ORDER BY ISNULL(q.sort_order,999), a.question_id
                `);
            res.json({ success: true, data: { ...row, answers: answers.recordset || [] } });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = {
    createFormRouter,
    createAdminFormRouter,
    QUESTION_TYPES,
    FORM_TYPES,
    DISC_META,
    DISC_OPTION_LABELS,
    findRequiredCourseForm,
    scoreDiscAnswers
};
