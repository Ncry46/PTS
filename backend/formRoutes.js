const express = require('express');
const sql = require('mssql');

const QUESTION_TYPES = new Set([
    'text', 'textarea', 'number', 'email', 'phone', 'date',
    'select', 'radio', 'checkbox', 'yesno'
]);

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
        flag_use: row.flag_use == null ? 1 : Number(row.flag_use)
    };
}

function createFormRouter({ poolPromise, requireLogin }) {
    const router = express.Router();

    // List published forms for logged-in users
    router.get('/forms', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT
                        f.form_id, f.title, f.description, f.allow_resubmit, f.updated_at, f.created_at,
                        (SELECT COUNT(*) FROM BD_PTS.dbo.custom_form_questions q
                         WHERE q.form_id = f.form_id AND ISNULL(q.flag_use,1)=1) AS question_count,
                        (SELECT TOP 1 r.response_id
                         FROM BD_PTS.dbo.custom_form_responses r
                         WHERE r.form_id = f.form_id AND r.user_id = @userId
                         ORDER BY r.submitted_at DESC) AS my_response_id,
                        (SELECT TOP 1 r.submitted_at
                         FROM BD_PTS.dbo.custom_form_responses r
                         WHERE r.form_id = f.form_id AND r.user_id = @userId
                         ORDER BY r.submitted_at DESC) AS my_submitted_at
                    FROM BD_PTS.dbo.custom_forms f
                    WHERE ISNULL(f.flag_use,1)=1 AND ISNULL(f.is_published,0)=1
                    ORDER BY f.updated_at DESC, f.form_id DESC
                `);
            res.json({ success: true, data: result.recordset || [] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Form detail + questions (published only, unless admin)
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
                    SELECT form_id, title, description, is_published, allow_resubmit, flag_use, updated_at
                    FROM BD_PTS.dbo.custom_forms
                    WHERE form_id = @formId AND ISNULL(flag_use,1)=1
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
                    FROM BD_PTS.dbo.custom_form_questions
                    WHERE form_id = @formId AND ISNULL(flag_use,1)=1
                    ORDER BY sort_order ASC, question_id ASC
                `);

            const mine = await pool.request()
                .input('formId', sql.Int, formId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT TOP 1 response_id, submitted_at
                    FROM BD_PTS.dbo.custom_form_responses
                    WHERE form_id = @formId AND user_id = @userId
                    ORDER BY submitted_at DESC
                `);

            res.json({
                success: true,
                data: {
                    ...form,
                    is_published: !!form.is_published,
                    allow_resubmit: !!form.allow_resubmit,
                    questions: (qRes.recordset || []).map(mapQuestion),
                    my_response: mine.recordset[0] || null
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
                    SELECT TOP 1 response_id, form_id, user_id, submitted_at
                    FROM BD_PTS.dbo.custom_form_responses
                    WHERE form_id = @formId AND user_id = @userId
                    ORDER BY submitted_at DESC
                `);
            const row = resp.recordset[0];
            if (!row) return res.json({ success: true, data: null });

            const answers = await pool.request()
                .input('responseId', sql.Int, row.response_id)
                .query(`
                    SELECT a.answer_id, a.question_id, a.answer_text, q.label, q.question_type
                    FROM BD_PTS.dbo.custom_form_answers a
                    LEFT JOIN BD_PTS.dbo.custom_form_questions q ON q.question_id = a.question_id
                    WHERE a.response_id = @responseId
                    ORDER BY ISNULL(q.sort_order, 999), a.question_id
                `);
            res.json({ success: true, data: { ...row, answers: answers.recordset || [] } });
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
                    SELECT form_id, is_published, allow_resubmit, flag_use
                    FROM BD_PTS.dbo.custom_forms
                    WHERE form_id = @formId AND ISNULL(flag_use,1)=1
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
                    FROM BD_PTS.dbo.custom_form_responses
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
                    FROM BD_PTS.dbo.custom_form_questions
                    WHERE form_id = @formId AND ISNULL(flag_use,1)=1
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

            const inserted = await pool.request()
                .input('formId', sql.Int, formId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    INSERT INTO BD_PTS.dbo.custom_form_responses (form_id, user_id)
                    OUTPUT INSERTED.response_id, INSERTED.submitted_at
                    VALUES (@formId, @userId)
                `);
            const responseId = inserted.recordset[0].response_id;

            for (const q of questions) {
                const val = answerMap.get(Number(q.question_id)) || '';
                await pool.request()
                    .input('responseId', sql.Int, responseId)
                    .input('questionId', sql.Int, q.question_id)
                    .input('answerText', sql.NVarChar, val)
                    .query(`
                        INSERT INTO BD_PTS.dbo.custom_form_answers (response_id, question_id, answer_text)
                        VALUES (@responseId, @questionId, @answerText)
                    `);
            }

            res.json({
                success: true,
                message: 'ส่งแบบฟอร์มสำเร็จ',
                data: {
                    response_id: responseId,
                    submitted_at: inserted.recordset[0].submitted_at
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
                    f.form_id, f.title, f.description, f.is_published, f.allow_resubmit,
                    f.flag_use, f.created_by, f.created_at, f.updated_at,
                    (SELECT COUNT(*) FROM BD_PTS.dbo.custom_form_questions q
                     WHERE q.form_id = f.form_id AND ISNULL(q.flag_use,1)=1) AS question_count,
                    (SELECT COUNT(*) FROM BD_PTS.dbo.custom_form_responses r
                     WHERE r.form_id = f.form_id) AS response_count
                FROM BD_PTS.dbo.custom_forms f
                WHERE ISNULL(f.flag_use,1)=1
                ORDER BY f.updated_at DESC, f.form_id DESC
            `);
            res.json({ success: true, data: result.recordset || [] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/forms', async (req, res) => {
        const admin = requireAdmin(req, res);
        if (!admin) return;
        const title = String(req.body?.title || '').trim();
        if (!title) return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อแบบฟอร์ม' });
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('title', sql.NVarChar, title)
                .input('description', sql.NVarChar, String(req.body?.description || '').trim() || null)
                .input('published', sql.Bit, req.body?.is_published ? 1 : 0)
                .input('resubmit', sql.Bit, req.body?.allow_resubmit ? 1 : 0)
                .input('createdBy', sql.Int, admin.user_id)
                .query(`
                    INSERT INTO BD_PTS.dbo.custom_forms
                        (title, description, is_published, allow_resubmit, flag_use, created_by)
                    OUTPUT INSERTED.*
                    VALUES (@title, @description, @published, @resubmit, 1, @createdBy)
                `);
            res.json({ success: true, data: result.recordset[0] });
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
                    SELECT * FROM BD_PTS.dbo.custom_forms
                    WHERE form_id = @formId AND ISNULL(flag_use,1)=1
                `);
            const form = formRes.recordset[0];
            if (!form) return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });

            const qRes = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    SELECT * FROM BD_PTS.dbo.custom_form_questions
                    WHERE form_id = @formId AND ISNULL(flag_use,1)=1
                    ORDER BY sort_order ASC, question_id ASC
                `);
            res.json({
                success: true,
                data: {
                    ...form,
                    is_published: !!form.is_published,
                    allow_resubmit: !!form.allow_resubmit,
                    questions: (qRes.recordset || []).map(mapQuestion)
                }
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
            const result = await pool.request()
                .input('formId', sql.Int, formId)
                .input('title', sql.NVarChar, body.title != null ? String(body.title).trim() : null)
                .input('description', sql.NVarChar, body.description != null ? String(body.description).trim() : null)
                .input('published', sql.Bit, body.is_published == null ? null : (body.is_published ? 1 : 0))
                .input('resubmit', sql.Bit, body.allow_resubmit == null ? null : (body.allow_resubmit ? 1 : 0))
                .query(`
                    UPDATE BD_PTS.dbo.custom_forms
                    SET
                        title = COALESCE(@title, title),
                        description = CASE WHEN @description IS NULL THEN description ELSE @description END,
                        is_published = COALESCE(@published, is_published),
                        allow_resubmit = COALESCE(@resubmit, allow_resubmit),
                        updated_at = GETDATE()
                    OUTPUT INSERTED.*
                    WHERE form_id = @formId AND ISNULL(flag_use,1)=1
                `);
            if (!result.recordset[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });
            }
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
            await pool.request()
                .input('formId', sql.Int, formId)
                .query(`
                    UPDATE BD_PTS.dbo.custom_forms
                    SET flag_use = 0, updated_at = GETDATE(), is_published = 0
                    WHERE form_id = @formId
                `);
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
        const questionType = String(req.body?.question_type || 'text').trim().toLowerCase();
        if (!label) return res.status(400).json({ success: false, message: 'กรุณาระบุคำถาม' });
        if (!QUESTION_TYPES.has(questionType)) {
            return res.status(400).json({ success: false, message: 'ประเภทคำถามไม่รองรับ' });
        }
        try {
            const pool = await poolPromise;
            const formOk = await pool.request()
                .input('formId', sql.Int, formId)
                .query(`SELECT form_id FROM BD_PTS.dbo.custom_forms WHERE form_id=@formId AND ISNULL(flag_use,1)=1`);
            if (!formOk.recordset[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบแบบฟอร์ม' });
            }

            let sortOrder = Number(req.body?.sort_order);
            if (!sortOrder) {
                const max = await pool.request()
                    .input('formId', sql.Int, formId)
                    .query(`
                        SELECT ISNULL(MAX(sort_order),0)+1 AS next_sort
                        FROM BD_PTS.dbo.custom_form_questions
                        WHERE form_id=@formId AND ISNULL(flag_use,1)=1
                    `);
                sortOrder = Number(max.recordset[0].next_sort) || 1;
            }

            const needsOptions = ['select', 'radio', 'checkbox'].includes(questionType);
            const optionsJson = needsOptions ? optionsToJson(req.body?.options ?? req.body?.options_json) : null;
            if (needsOptions && !optionsJson) {
                return res.status(400).json({ success: false, message: 'กรุณาระบุตัวเลือกสำหรับคำถามประเภทนี้' });
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
                    INSERT INTO BD_PTS.dbo.custom_form_questions
                        (form_id, label, help_text, question_type, options_json, is_required, sort_order, flag_use)
                    OUTPUT INSERTED.*
                    VALUES (@formId, @label, @help, @qType, @opts, @req, @sort, 1)
                `);

            await pool.request()
                .input('formId', sql.Int, formId)
                .query(`UPDATE BD_PTS.dbo.custom_forms SET updated_at = GETDATE() WHERE form_id = @formId`);

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
                    SELECT * FROM BD_PTS.dbo.custom_form_questions
                    WHERE question_id=@questionId AND ISNULL(flag_use,1)=1
                `);
            const row = cur.recordset[0];
            if (!row) return res.status(404).json({ success: false, message: 'ไม่พบคำถาม' });

            const questionType = body.question_type != null
                ? String(body.question_type).trim().toLowerCase()
                : row.question_type;
            if (!QUESTION_TYPES.has(questionType)) {
                return res.status(400).json({ success: false, message: 'ประเภทคำถามไม่รองรับ' });
            }

            let optionsJson = row.options_json;
            if (body.options != null || body.options_json != null) {
                optionsJson = optionsToJson(body.options ?? body.options_json);
            }
            if (['select', 'radio', 'checkbox'].includes(questionType) && !optionsJson) {
                return res.status(400).json({ success: false, message: 'กรุณาระบุตัวเลือกสำหรับคำถามประเภทนี้' });
            }
            if (!['select', 'radio', 'checkbox'].includes(questionType)) {
                optionsJson = null;
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
                    UPDATE BD_PTS.dbo.custom_form_questions
                    SET label=@label, help_text=@help, question_type=@qType,
                        options_json=@opts, is_required=@req, sort_order=@sort
                    OUTPUT INSERTED.*
                    WHERE question_id=@questionId AND ISNULL(flag_use,1)=1
                `);

            await pool.request()
                .input('formId', sql.Int, row.form_id)
                .query(`UPDATE BD_PTS.dbo.custom_forms SET updated_at = GETDATE() WHERE form_id = @formId`);

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
                .query(`SELECT form_id FROM BD_PTS.dbo.custom_form_questions WHERE question_id=@questionId`);
            if (!cur.recordset[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบคำถาม' });
            }
            await pool.request()
                .input('questionId', sql.Int, questionId)
                .query(`UPDATE BD_PTS.dbo.custom_form_questions SET flag_use = 0 WHERE question_id=@questionId`);
            await pool.request()
                .input('formId', sql.Int, cur.recordset[0].form_id)
                .query(`UPDATE BD_PTS.dbo.custom_forms SET updated_at = GETDATE() WHERE form_id = @formId`);
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
                        u.full_name, u.email
                    FROM BD_PTS.dbo.custom_form_responses r
                    LEFT JOIN BD_PTS.dbo.users_main u ON u.user_id = r.user_id
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
                    SELECT r.response_id, r.form_id, r.user_id, r.submitted_at, u.full_name, u.email
                    FROM BD_PTS.dbo.custom_form_responses r
                    LEFT JOIN BD_PTS.dbo.users_main u ON u.user_id = r.user_id
                    WHERE r.response_id=@responseId AND r.form_id=@formId
                `);
            const row = resp.recordset[0];
            if (!row) return res.status(404).json({ success: false, message: 'ไม่พบคำตอบ' });

            const answers = await pool.request()
                .input('responseId', sql.Int, responseId)
                .query(`
                    SELECT a.answer_id, a.question_id, a.answer_text, q.label, q.question_type, q.sort_order
                    FROM BD_PTS.dbo.custom_form_answers a
                    LEFT JOIN BD_PTS.dbo.custom_form_questions q ON q.question_id = a.question_id
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

module.exports = { createFormRouter, createAdminFormRouter, QUESTION_TYPES };
