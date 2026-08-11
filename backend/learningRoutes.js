const express = require('express');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { buildPromptPayPayload, getPromptPayId } = require('./promptpay');
const { mapHeroSlidesImages } = require('./heroImages');
const { markPaidAndEnroll, ensureEnrolled } = require('./paymentActions');
const { findRequiredCourseForm } = require('./formRoutes');
const { tryUploadLocalFile } = require('./googleDrive');
const { flagActiveSql, isFlagActive } = require('./db');
const { localizeCourseRow, localizeCourseRows, resolveLangFromReq, pickText } = require('./courseLang');
const { loadValidCoupon, recordRedemption, normalizeCouponCode } = require('./couponHelpers');

const SLIP_DIR = path.join(__dirname, '..', 'uploads', 'slips');
const SLIP_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function ensureSlipDir() {
    try { fs.mkdirSync(SLIP_DIR, { recursive: true }); } catch (_) { /* ignore */ }
}

const slipUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            ensureSlipDir();
            cb(null, SLIP_DIR);
        },
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)
                ? (ext === '.jpeg' ? '.jpg' : ext)
                : '.jpg';
            cb(null, `slip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (SLIP_MIME.has(String(file.mimetype || '').toLowerCase())) cb(null, true);
        else cb(new Error('รองรับเฉพาะไฟล์รูปสลิป JPG, PNG, WEBP หรือ GIF'));
    }
});

function createLearningRouter({ poolPromise, requireLogin }) {
    const router = express.Router();
    ensureSlipDir();

    async function recalculateCourseProgress(pool, userId, courseId) {
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .input('courseId', sql.Int, courseId)
            .query(`
                SELECT
                    (SELECT COUNT(*) FROM dbo.course_lessons WHERE course_id = @courseId AND ${flagActiveSql('flag_use')}) AS total_lessons,
                    (
                        SELECT COUNT(*)
                        FROM dbo.lesson_progress lp
                        INNER JOIN dbo.course_lessons l ON lp.lesson_id = l.lesson_id
                        WHERE lp.user_id = @userId AND l.course_id = @courseId AND lp.completed = 1 AND ${flagActiveSql('l.flag_use')}
                    ) AS completed_lessons
            `);

        const total = Number(result.recordset[0].total_lessons || 0);
        const completed = Number(result.recordset[0].completed_lessons || 0);
        const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
        const status = progress >= 100 ? 'completed' : 'in_progress';

        await pool.request()
            .input('userId', sql.Int, userId)
            .input('courseId', sql.Int, courseId)
            .input('progress', sql.Int, progress)
            .input('status', sql.VarChar, status)
            .query(`
                UPDATE dbo.course_enrollments
                SET progress_percent = @progress, status = @status, updated_at = GETDATE()
                WHERE user_id = @userId AND course_id = @courseId
            `);

        if (progress >= 100) {
            const code = `PTS-${new Date().getFullYear()}-${courseId}-${userId}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            await pool.request()
                .input('userId', sql.Int, userId)
                .input('courseId', sql.Int, courseId)
                .input('code', sql.VarChar, code)
                .query(`
                    IF NOT EXISTS (
                        SELECT 1 FROM dbo.certificates WHERE user_id = @userId AND course_id = @courseId
                    )
                    INSERT INTO dbo.certificates (user_id, course_id, certificate_code)
                    VALUES (@userId, @courseId, @code)
                `);
        }

        return { progress, status, total, completed };
    }

    async function ensureEnrolled(pool, userId, courseId) {
        const existing = await pool.request()
            .input('userId', sql.Int, userId)
            .input('courseId', sql.Int, courseId)
            .query(`SELECT enrollment_id FROM dbo.course_enrollments WHERE user_id = @userId AND course_id = @courseId`);
        return existing.recordset.length > 0;
    }

    // บทเรียนของหลักสูตร
    router.get('/courses/:courseId/lessons', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });

        try {
            const pool = await poolPromise;
            const course = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT course_id,
                           CONVERT(NVARCHAR(255), course_name_th) AS course_name_th,
                           CONVERT(NVARCHAR(255), course_name_en) AS course_name_en,
                           CONVERT(NVARCHAR(255), instructor_name_th) AS instructor_name_th,
                           CONVERT(NVARCHAR(255), instructor_name_en) AS instructor_name_en,
                           COALESCE(
                             NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), course_name_th))), N''),
                             NULLIF(LTRIM(RTRIM(CONVERT(NVARCHAR(255), course_name_en))), N'')
                           ) AS course_name
                    FROM dbo.courses WHERE course_id = @courseId
                `);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }
            const lang = resolveLangFromReq(req);

            const enrolled = await ensureEnrolled(pool, user.user_id, courseId);
            let required_form = null;
            if (enrolled && (user.role || '').toLowerCase() !== 'admin') {
                required_form = await findRequiredCourseForm(pool, user.user_id, courseId);
            }
            const lessons = await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT
                        l.lesson_id, l.course_id,
                        COALESCE(NULLIF(LTRIM(RTRIM(CAST(l.lesson_title AS NVARCHAR(255)))), N''), l.section_title) AS title,
                        l.section_title, l.lesson_title, l.video_url, l.sort_order, l.duration_minutes,
                        ISNULL(lp.completed, 0) AS completed
                    FROM dbo.course_lessons l
                    LEFT JOIN dbo.lesson_progress lp
                        ON lp.lesson_id = l.lesson_id AND lp.user_id = @userId
                    WHERE l.course_id = @courseId AND ${flagActiveSql('l.flag_use')}
                    ORDER BY ISNULL(l.sort_order, 999) ASC, l.lesson_id ASC
                `);

            res.json({
                success: true,
                enrolled,
                required_form,
                lang,
                course: localizeCourseRow(course.recordset[0], lang),
                data: required_form ? [] : lessons.recordset
            });
        } catch (error) {
            console.error('❌ lessons list:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/lessons/:lessonId', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const lessonId = parseInt(req.params.lessonId, 10);
        if (!lessonId) return res.status(400).json({ success: false, message: 'รหัสบทเรียนไม่ถูกต้อง' });

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('lessonId', sql.Int, lessonId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT
                        l.lesson_id, l.course_id,
                        COALESCE(NULLIF(LTRIM(RTRIM(CAST(l.lesson_title AS NVARCHAR(255)))), N''), l.section_title) AS title,
                        l.section_title, l.lesson_title, l.content_html, l.video_url,
                        l.sort_order, l.duration_minutes, c.course_name_th, c.course_name_en,
                        COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name,
                        ISNULL(lp.completed, 0) AS completed
                    FROM dbo.course_lessons l
                    INNER JOIN dbo.courses c ON c.course_id = l.course_id
                    LEFT JOIN dbo.lesson_progress lp
                        ON lp.lesson_id = l.lesson_id AND lp.user_id = @userId
                    WHERE l.lesson_id = @lessonId AND ${flagActiveSql('l.flag_use')}
                `);

            if (!result.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบบทเรียน' });
            }

            const lesson = result.recordset[0];
            const enrolled = await ensureEnrolled(pool, user.user_id, lesson.course_id);
            if (!enrolled && user.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'กรุณาสมัครเรียนหลักสูตรนี้ก่อนเข้าเรียน' });
            }
            if ((user.role || '').toLowerCase() !== 'admin') {
                const requiredForm = await findRequiredCourseForm(pool, user.user_id, lesson.course_id);
                if (requiredForm) {
                    return res.status(403).json({
                        success: false,
                        message: 'กรุณากรอกแบบฟอร์มก่อนเริ่มเรียนหลักสูตรนี้',
                        required_form: requiredForm
                    });
                }
            }

            const siblings = await pool.request()
                .input('courseId', sql.Int, lesson.course_id)
                .query(`
                    SELECT lesson_id,
                           COALESCE(NULLIF(LTRIM(RTRIM(CAST(lesson_title AS NVARCHAR(255)))), N''), section_title) AS title,
                           section_title, lesson_title, sort_order
                    FROM dbo.course_lessons
                    WHERE course_id = @courseId AND ${flagActiveSql('flag_use')}
                    ORDER BY ISNULL(sort_order, 999) ASC, lesson_id ASC
                `);

            res.json({ success: true, data: lesson, lessons: siblings.recordset });
        } catch (error) {
            console.error('❌ lesson detail:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/lessons/:lessonId/complete', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const lessonId = parseInt(req.params.lessonId, 10);
        if (!lessonId) return res.status(400).json({ success: false, message: 'รหัสบทเรียนไม่ถูกต้อง' });

        try {
            const pool = await poolPromise;
            const lesson = await pool.request()
                .input('lessonId', sql.Int, lessonId)
                .query(`SELECT lesson_id, course_id FROM dbo.course_lessons WHERE lesson_id = @lessonId AND ${flagActiveSql('flag_use')}`);

            if (!lesson.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบบทเรียน' });
            }

            const courseId = lesson.recordset[0].course_id;
            const enrolled = await ensureEnrolled(pool, user.user_id, courseId);
            if (!enrolled) {
                return res.status(403).json({ success: false, message: 'ยังไม่ได้สมัครหลักสูตรนี้' });
            }

            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('lessonId', sql.Int, lessonId)
                .query(`
                    IF EXISTS (SELECT 1 FROM dbo.lesson_progress WHERE user_id = @userId AND lesson_id = @lessonId)
                        UPDATE dbo.lesson_progress
                        SET completed = 1, completed_at = GETDATE()
                        WHERE user_id = @userId AND lesson_id = @lessonId
                    ELSE
                        INSERT INTO dbo.lesson_progress (user_id, lesson_id, completed, completed_at)
                        VALUES (@userId, @lessonId, 1, GETDATE())
                `);

            const progress = await recalculateCourseProgress(pool, user.user_id, courseId);
            res.json({ success: true, message: 'บันทึกการเรียนบทนี้แล้ว', ...progress });
        } catch (error) {
            console.error('❌ complete lesson:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // ตารางเรียนของฉัน
    router.get('/my/schedules', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT
                        s.schedule_id, s.section_title, s.start_at, s.end_at, s.location,
                        s.meeting_url, s.delivery_mode, s.course_id, 
                        c.course_name_th, 
                        c.course_name_en,
                        COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name
                    FROM dbo.class_schedules s
                    LEFT JOIN dbo.courses c ON c.course_id = s.course_id
                    WHERE ${flagActiveSql('s.flag_use')}
                      AND s.course_id IS NOT NULL
                      AND EXISTS (
                            SELECT 1 FROM dbo.course_enrollments e
                            WHERE e.user_id = @userId AND e.course_id = s.course_id
                      )
                    ORDER BY s.start_at ASC
                `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // รายการตารางเรียนทั่วไป
    router.get('/schedules', async (req, res) => {
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT TOP 50
                    s.schedule_id, s.section_title, s.start_at, s.end_at, s.location,
                    s.meeting_url, s.delivery_mode, s.course_id, 
                    c.course_name_th, 
                    c.course_name_en,
                    COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name
                FROM dbo.class_schedules s
                LEFT JOIN dbo.courses c ON c.course_id = s.course_id
                WHERE ${flagActiveSql('s.flag_use')} AND s.start_at >= DATEADD(day, -1, GETDATE())
                ORDER BY s.start_at ASC
            `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // ใบประกาศ
    router.get('/my/certificates', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT
                        cert.certificate_id, cert.certificate_code, cert.issued_at,
                        c.course_id, c.course_name_th, c.course_name_en, c.instructor_name_th, c.instructor_name_en,
                        COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name,
                        COALESCE(NULLIF(LTRIM(RTRIM(c.instructor_name_th)), N''), NULLIF(LTRIM(RTRIM(c.instructor_name_en)), N'')) AS instructor_name,
                        c.cover_image_url,
                        c.delivery_mode,
                        COALESCE(prog.last_completed_at, CASE WHEN e.status = 'completed' THEN e.updated_at END, cert.issued_at) AS completed_at
                    FROM dbo.certificates cert
                    INNER JOIN dbo.courses c ON c.course_id = cert.course_id
                    LEFT JOIN dbo.course_enrollments e
                        ON e.user_id = cert.user_id AND e.course_id = cert.course_id
                    OUTER APPLY (
                        SELECT MAX(lp.completed_at) AS last_completed_at
                        FROM dbo.lesson_progress lp
                        INNER JOIN dbo.course_lessons l ON l.lesson_id = lp.lesson_id
                        WHERE lp.user_id = cert.user_id
                          AND l.course_id = cert.course_id
                          AND lp.completed = 1
                          AND ${flagActiveSql('l.flag_use')}
                          AND lp.completed_at IS NOT NULL
                    ) prog
                    WHERE cert.user_id = @userId
                    ORDER BY COALESCE(prog.last_completed_at, CASE WHEN e.status = 'completed' THEN e.updated_at END, cert.issued_at) DESC
                `);
            res.json({ success: true, lang: resolveLangFromReq(req), data: localizeCourseRows(result.recordset, resolveLangFromReq(req)) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    function luhnOk(num) {
        const s = String(num || '').replace(/\D/g, '');
        if (s.length < 13 || s.length > 19) return false;
        let sum = 0;
        let alt = false;
        for (let i = s.length - 1; i >= 0; i -= 1) {
            let n = Number(s[i]);
            if (alt) {
                n *= 2;
                if (n > 9) n -= 9;
            }
            sum += n;
            alt = !alt;
        }
        return sum % 10 === 0;
    }

    // ชำระเงิน — PromptPay QR + บัตรเครดิต
    router.get('/my/payments', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT
                        p.payment_id, p.amount, p.currency, p.status, p.method, p.source,
                        p.reference_code, p.paid_at, p.created_at, p.slip_image_url, p.transfer_at,
                        p.reject_reason,
                        c.course_id, c.course_name_th, c.course_name_en,
                        COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name,
                        c.cover_image_url
                    FROM dbo.payments p
                    INNER JOIN dbo.courses c ON c.course_id = p.course_id
                    WHERE p.user_id = @userId
                    ORDER BY p.created_at DESC
                `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/payments/:paymentId', async (req, res) => {
    const user = requireLogin(req, res);
    if (!user) return;
    const paymentId = parseInt(req.params.paymentId, 10);
    if (!paymentId) return res.status(400).json({ success: false, message: 'รหัสการชำระไม่ถูกต้อง' });

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('paymentId', sql.Int, paymentId)
            .input('userId', sql.Int, user.user_id)
            .query(`
                SELECT
                    p.payment_id, p.amount, p.currency, p.status, p.method, p.source,
                    p.reference_code, p.paid_at, p.created_at, p.course_id,
                    p.slip_image_url, p.transfer_at, p.reject_reason,
                    -- ✅ แก้ไขจุดนี้: ดึง course_name_th / course_name_en และตั้ง Alias เป็น course_name
                    c.course_name_th, 
                    c.course_name_en,
                    COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name
                FROM dbo.payments p
                INNER JOIN dbo.courses c ON c.course_id = p.course_id
                WHERE p.payment_id = @paymentId AND p.user_id = @userId
            `);
        if (!result.recordset.length) {
            return res.status(404).json({ success: false, message: 'ไม่พบรายการชำระเงิน' });
        }
        const row = result.recordset[0];
        const promptpayId = getPromptPayId();
        const payload = row.method === 'promptpay' && row.status === 'pending'
            ? buildPromptPayPayload(promptpayId, row.amount)
            : null;
        res.json({
            success: true,
            data: row,
            promptpay: payload ? {
                id_masked: String(promptpayId).replace(/(\d{3})\d+(\d{3})/, '$1****$2'),
                qr_payload: payload
            } : null
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

    router.get('/courses/:courseId/checkout', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) {
            return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });
        }

        try {
            const pool = await poolPromise;
            const course = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT course_id, course_name_th, course_name_en,
                           COALESCE(NULLIF(LTRIM(RTRIM(course_name_th)), N''), NULLIF(LTRIM(RTRIM(course_name_en)), N'')) AS course_name,
                           ISNULL(price, 0) AS price
                    FROM dbo.courses
                    WHERE course_id = @courseId
                `);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }

            const row = course.recordset[0];
            const isEnrolled = await ensureEnrolled(pool, user.user_id, courseId);

            const paid = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT TOP 1 payment_id FROM dbo.payments
                    WHERE user_id = @userId AND course_id = @courseId AND status = 'paid'
                `);

            const pending = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT TOP 1
                        payment_id, amount, status, method, reference_code, slip_image_url
                    FROM dbo.payments
                    WHERE user_id = @userId AND course_id = @courseId
                      AND status IN ('pending', 'pending_review', 'rejected')
                    ORDER BY created_at DESC
                `);

            let pendingPayment = null;
            if (pending.recordset.length) {
                const p = pending.recordset[0];
                pendingPayment = {
                    payment_id: p.payment_id,
                    amount: p.amount,
                    status: p.status,
                    method: p.method,
                    reference_code: p.reference_code,
                    qr_payload: null
                };
                if (p.method === 'promptpay' && p.status === 'pending') {
                    const promptpayId = getPromptPayId();
                    pendingPayment.qr_payload = buildPromptPayPayload(promptpayId, p.amount);
                }
            }

                res.json({
                success: true,
                data: {
                    course_id: row.course_id,
                    // ✅ ใช้คอลัมน์จริง row.course_name_th / row.course_name_en
                    course_name: row.course_name_th || row.course_name_en || '', 
                    course_name_th: row.course_name_th || '',
                    course_name_en: row.course_name_en || '',
                    price: Number(row.price) || 0,
                    is_enrolled: isEnrolled,
                    is_paid: paid.recordset.length > 0,
                    pending_payment: pendingPayment
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/courses/:courseId/pay', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) {
            return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });
        }

        const methodRaw = String(req.body.method || 'promptpay').toLowerCase();
        const method = methodRaw === 'card' ? 'card' : 'promptpay';
        const source = 'direct_signup';
        const couponCode = normalizeCouponCode(req.body.coupon_code || req.body.couponCode || '');

        try {
            const pool = await poolPromise;
            const course = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`SELECT course_id, course_name_th, course_name_en,
                           COALESCE(NULLIF(LTRIM(RTRIM(course_name_th)), N''), NULLIF(LTRIM(RTRIM(course_name_en)), N'')) AS course_name,
                           ISNULL(price, 0) AS price FROM dbo.courses WHERE course_id = @courseId`);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }

            const dbPrice = Number(course.recordset[0].price) || 0;
            let amount = dbPrice;
            let couponId = null;
            let discountApplied = 0;

            if (couponCode) {
                const validated = await loadValidCoupon(pool, {
                    code: couponCode,
                    courseId,
                    userId: user.user_id
                });
                if (!validated.ok) {
                    return res.status(validated.status || 400).json({
                        success: false,
                        message: validated.message
                    });
                }
                amount = validated.finalAmount;
                couponId = validated.coupon.coupon_id;
                discountApplied = validated.discount;
            }

            if (!Number.isFinite(amount) || amount < 0) {
                return res.status(400).json({ success: false, message: 'ยอดชำระไม่ถูกต้อง' });
            }
            if (amount <= 0 && !couponId) {
                return res.status(400).json({
                    success: false,
                    message: 'หลักสูตรนี้ยังไม่มีราคา กรุณาติดต่อแอดมิน หรือใช้รหัสเข้าเรียน/คูปอง'
                });
            }

            const paid = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .query(`SELECT TOP 1 payment_id FROM dbo.payments WHERE user_id = @userId AND course_id = @courseId AND status = 'paid'`);
            if (paid.recordset.length) {
                return res.json({ success: true, already_paid: true, message: 'คุณชำระเงินหลักสูตรนี้แล้ว' });
            }

            if (amount <= 0 && couponId) {
                const reference = `CPN${Date.now()}${user.user_id}`;
                const inserted = await pool.request()
                    .input('userId', sql.Int, user.user_id)
                    .input('courseId', sql.Int, courseId)
                    .input('amount', sql.Decimal(10, 2), 0)
                    .input('method', sql.VarChar, 'coupon')
                    .input('source', sql.VarChar, 'coupon')
                    .input('reference', sql.VarChar, reference)
                    .input('couponId', sql.Int, couponId)
                    .query(`
                        INSERT INTO dbo.payments
                        (user_id, course_id, amount, currency, status, method, source, reference_code, coupon_id, paid_at)
                        OUTPUT INSERTED.payment_id, INSERTED.reference_code, INSERTED.amount, INSERTED.status, INSERTED.method, INSERTED.source
                        VALUES (@userId, @courseId, @amount, 'THB', 'pending', @method, @source, @reference, @couponId, NULL)
                    `);
                const paymentRow = inserted.recordset[0];
                await recordRedemption(pool, {
                    couponId,
                    userId: user.user_id,
                    paymentId: paymentRow.payment_id,
                    courseId,
                    discountApplied
                });
                await markPaidAndEnroll(pool, user.user_id, paymentRow.payment_id, courseId);
                return res.json({
                    success: true,
                    free_with_coupon: true,
                    message: 'ใช้คูปองสำเร็จ — เปิดสิทธิ์เรียนแล้ว (0 บาท)',
                    data: paymentRow,
                    course: course.recordset[0],
                    discount: discountApplied
                });
            }

            const pending = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .input('method', sql.VarChar, method)
                .query(`
                    SELECT TOP 1 payment_id, reference_code, amount, status, method, source
                    FROM dbo.payments
                    WHERE user_id = @userId AND course_id = @courseId
                      AND status IN ('pending', 'pending_review', 'rejected')
                      AND method = @method
                    ORDER BY created_at DESC
                `);

            let paymentRow;
            if (pending.recordset.length) {
                paymentRow = pending.recordset[0];
                await pool.request()
                    .input('paymentId', sql.Int, paymentRow.payment_id)
                    .input('amount', sql.Decimal(10, 2), amount)
                    .input('source', sql.VarChar, source)
                    .input('couponId', sql.Int, couponId)
                    .query(`
                        UPDATE dbo.payments
                        SET amount = @amount, status = 'pending', source = @source,
                            coupon_id = @couponId,
                            slip_image_url = NULL, transfer_at = NULL, reject_reason = NULL,
                            reviewed_by = NULL, reviewed_at = NULL
                        WHERE payment_id = @paymentId
                    `);
                paymentRow.amount = amount;
                paymentRow.status = 'pending';
                paymentRow.source = source;
            } else {
                const reference = `PAY${Date.now()}${user.user_id}`;
                const inserted = await pool.request()
                    .input('userId', sql.Int, user.user_id)
                    .input('courseId', sql.Int, courseId)
                    .input('amount', sql.Decimal(10, 2), amount)
                    .input('method', sql.VarChar, method)
                    .input('source', sql.VarChar, source)
                    .input('reference', sql.VarChar, reference)
                    .input('couponId', sql.Int, couponId)
                    .query(`
                        INSERT INTO dbo.payments
                        (user_id, course_id, amount, currency, status, method, source, reference_code, coupon_id)
                        OUTPUT INSERTED.payment_id, INSERTED.reference_code, INSERTED.amount, INSERTED.status, INSERTED.method, INSERTED.source
                        VALUES (@userId, @courseId, @amount, 'THB', 'pending', @method, @source, @reference, @couponId)
                    `);
                paymentRow = inserted.recordset[0];
            }

            const promptpayId = getPromptPayId();
            const qrPayload = method === 'promptpay'
                ? buildPromptPayPayload(promptpayId, paymentRow.amount)
                : null;

            res.json({
                success: true,
                message: method === 'promptpay'
                    ? 'สร้างรายการ PromptPay แล้ว สแกน QR แล้วแนบสลิปเพื่อรอแอดมินตรวจสอบ'
                    : 'พร้อมชำระด้วยบัตรเครดิต',
                data: paymentRow,
                course: course.recordset[0],
                discount: discountApplied,
                promptpay: qrPayload ? {
                    id_masked: String(promptpayId).replace(/(\d{3})\d+(\d{3})/, '$1****$2'),
                    qr_payload: qrPayload
                } : null
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/payments/:paymentId/confirm', (req, res) => {
        slipUpload.single('slip')(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message || 'อัปโหลดสลิปไม่สำเร็จ' });
            }
            const user = requireLogin(req, res);
            if (!user) return;

            const paymentId = parseInt(req.params.paymentId, 10);
            if (!paymentId) return res.status(400).json({ success: false, message: 'รหัสการชำระไม่ถูกต้อง' });

            try {
                const pool = await poolPromise;
                const payment = await pool.request()
                    .input('paymentId', sql.Int, paymentId)
                    .input('userId', sql.Int, user.user_id)
                    .query(`
                        SELECT payment_id, course_id, status, method, slip_image_url
                        FROM dbo.payments
                        WHERE payment_id = @paymentId AND user_id = @userId
                    `);

                if (!payment.recordset.length) {
                    return res.status(404).json({ success: false, message: 'ไม่พบรายการชำระเงิน' });
                }

                const row = payment.recordset[0];
                if (row.status === 'paid') {
                    return res.json({ success: true, message: 'ชำระเงินแล้วก่อนหน้านี้', already_paid: true });
                }
                if (row.status === 'pending_review') {
                    return res.json({
                        success: true,
                        message: 'ส่งสลิปแล้ว รอแอดมินตรวจสอบ',
                        pending_review: true
                    });
                }
                if (row.method === 'card') {
                    return res.status(400).json({
                        success: false,
                        message: 'รายการบัตรเครดิตต้องชำระผ่านฟอร์มบัตร ไม่ใช่แนบสลิป'
                    });
                }

                if (!req.file) {
                    return res.status(400).json({
                        success: false,
                        message: 'กรุณาแนบรูปสลิปโอนเงินก่อนส่งตรวจสอบ'
                    });
                }

                let slipUrl = `/uploads/slips/${req.file.filename}`;
                const transferRaw = String(req.body.transfer_at || '').trim();
                let transferAt = null;
                if (transferRaw) {
                    const d = new Date(transferRaw);
                    if (!Number.isNaN(d.getTime())) transferAt = d;
                }

                // Keep local slip for reliable admin preview; Drive holds a backup copy.
                const drive = await tryUploadLocalFile(req.file.path, {
                    filename: req.file.filename,
                    mimeType: req.file.mimetype
                });
                if (drive && drive.ok && drive.fileId) {
                    // slipUrl stays local — do not delete the file after Drive backup
                } else if (drive && drive.error) {
                    console.warn('[slip→drive]', drive.error);
                }

                // Remove previous slip file if re-submitting after reject
                if (row.slip_image_url && String(row.slip_image_url).startsWith('/uploads/slips/')) {
                    try {
                        const prev = path.join(SLIP_DIR, path.basename(row.slip_image_url));
                        if (fs.existsSync(prev)) fs.unlinkSync(prev);
                    } catch (_) { /* ignore */ }
                }

                await pool.request()
                    .input('paymentId', sql.Int, paymentId)
                    .input('slipUrl', sql.NVarChar, slipUrl)
                    .input('transferAt', sql.DateTime, transferAt)
                    .query(`
                        UPDATE dbo.payments
                        SET status = 'pending_review',
                            slip_image_url = @slipUrl,
                            transfer_at = COALESCE(@transferAt, GETDATE()),
                            reject_reason = NULL,
                            reviewed_by = NULL,
                            reviewed_at = NULL
                        WHERE payment_id = @paymentId
                    `);

                res.json({
                    success: true,
                    pending_review: true,
                    message: 'ส่งสลิปแล้ว — รอแอดมินตรวจสอบ เมื่ออนุมัติแล้วจะเปิดสิทธิ์เรียนให้อัตโนมัติ'
                });
            } catch (error) {
                res.status(500).json({ success: false, message: error.message });
            }
        });
    });

    // ชำระด้วยบัตรเครดิต (ประมวลผลในระบบ — ไม่เก็บเลขบัตรเต็ม)
    router.post('/payments/:paymentId/charge-card', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const paymentId = parseInt(req.params.paymentId, 10);
        if (!paymentId) return res.status(400).json({ success: false, message: 'รหัสการชำระไม่ถูกต้อง' });

        const cardNumber = String(req.body.card_number || '').replace(/\D/g, '');
        const expMonth = String(req.body.exp_month || '').replace(/\D/g, '');
        const expYear = String(req.body.exp_year || '').replace(/\D/g, '');
        const cvc = String(req.body.cvc || '').replace(/\D/g, '');
        const cardName = String(req.body.card_name || '').trim();

        if (!cardName || cardName.length < 2) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อบนบัตร' });
        }
        if (!luhnOk(cardNumber)) {
            return res.status(400).json({ success: false, message: 'เลขบัตรเครดิตไม่ถูกต้อง' });
        }
        const month = Number(expMonth);
        const year = Number(expYear.length === 2 ? `20${expYear}` : expYear);
        if (!(month >= 1 && month <= 12) || !year) {
            return res.status(400).json({ success: false, message: 'วันหมดอายุบัตรไม่ถูกต้อง' });
        }
        const now = new Date();
        if (year < now.getFullYear() || (year === now.getFullYear() && month < now.getMonth() + 1)) {
            return res.status(400).json({ success: false, message: 'บัตรหมดอายุแล้ว' });
        }
        if (cvc.length < 3 || cvc.length > 4) {
            return res.status(400).json({ success: false, message: 'รหัส CVC ไม่ถูกต้อง' });
        }

        try {
            const pool = await poolPromise;
            const payment = await pool.request()
                .input('paymentId', sql.Int, paymentId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT payment_id, course_id, status, method, amount
                    FROM dbo.payments
                    WHERE payment_id = @paymentId AND user_id = @userId
                `);
            if (!payment.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบรายการชำระเงิน' });
            }
            const row = payment.recordset[0];
            if (row.status === 'paid') {
                return res.json({ success: true, message: 'ชำระเงินแล้วก่อนหน้านี้', already_paid: true });
            }
            if (row.method !== 'card') {
                return res.status(400).json({ success: false, message: 'รายการนี้ไม่ใช่ช่องทางบัตรเครดิต' });
            }

            // Demo / sandbox charge — approve valid cards (gateway auto-approved)
            await pool.request()
                .input('paymentId', sql.Int, paymentId)
                .input('method', sql.VarChar, 'card')
                .input('source', sql.VarChar, 'direct_signup')
                .query(`
                    UPDATE dbo.payments
                    SET method = @method, source = @source
                    WHERE payment_id = @paymentId
                `);

            await markPaidAndEnroll(pool, user.user_id, paymentId, row.course_id);

            const last4 = cardNumber.slice(-4);
            res.json({
                success: true,
                auto_approved: true,
                message: `ชำระด้วยบัตร •••• ${last4} สำเร็จ — อนุมัติอัตโนมัติและเปิดสิทธิ์เรียนแล้ว`,
                last4
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    /** Preview coupon discount for a course */
    router.post('/coupons/validate', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const courseId = parseInt(req.body.courseId || req.body.course_id, 10);
        const code = req.body.code;
        try {
            const pool = await poolPromise;
            const validated = await loadValidCoupon(pool, {
                code,
                courseId,
                userId: user.user_id
            });
            if (!validated.ok) {
                return res.status(validated.status || 400).json({
                    success: false,
                    message: validated.message
                });
            }
            res.json({
                success: true,
                data: {
                    code: validated.coupon.code,
                    course_id: courseId,
                    course_price: validated.coursePrice,
                    discount_amount: validated.discount,
                    final_amount: validated.finalAmount,
                    course_name: validated.courseName
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    /** Apply coupon: free enroll if 0, else return discount for checkout */
    router.post('/coupons/apply', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const courseId = parseInt(req.body.courseId || req.body.course_id, 10);
        const code = req.body.code;
        try {
            const pool = await poolPromise;
            const validated = await loadValidCoupon(pool, {
                code,
                courseId,
                userId: user.user_id
            });
            if (!validated.ok) {
                return res.status(validated.status || 400).json({
                    success: false,
                    message: validated.message
                });
            }

            const paid = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT TOP 1 payment_id FROM dbo.payments
                    WHERE user_id = @userId AND course_id = @courseId AND status = 'paid'
                `);
            if (paid.recordset.length) {
                return res.json({
                    success: true,
                    already_paid: true,
                    message: 'คุณมีสิทธิ์เรียนหลักสูตรนี้อยู่แล้ว'
                });
            }

            if (validated.finalAmount <= 0) {
                const reference = `CPN${Date.now()}${user.user_id}`;
                const inserted = await pool.request()
                    .input('userId', sql.Int, user.user_id)
                    .input('courseId', sql.Int, courseId)
                    .input('amount', sql.Decimal(10, 2), 0)
                    .input('method', sql.VarChar, 'coupon')
                    .input('source', sql.VarChar, 'coupon')
                    .input('reference', sql.VarChar, reference)
                    .input('couponId', sql.Int, validated.coupon.coupon_id)
                    .query(`
                        INSERT INTO dbo.payments
                        (user_id, course_id, amount, currency, status, method, source, reference_code, coupon_id, paid_at)
                        OUTPUT INSERTED.payment_id
                        VALUES (@userId, @courseId, @amount, 'THB', 'pending', @method, @source, @reference, @couponId, NULL)
                    `);
                const paymentId = inserted.recordset[0].payment_id;
                await recordRedemption(pool, {
                    couponId: validated.coupon.coupon_id,
                    userId: user.user_id,
                    paymentId,
                    courseId,
                    discountApplied: validated.discount
                });
                await markPaidAndEnroll(pool, user.user_id, paymentId, courseId);
                return res.json({
                    success: true,
                    free_with_coupon: true,
                    message: `ใช้คูปองสำเร็จ — เปิดสิทธิ์เรียน ${validated.courseName || ''} แล้ว (0 บาท)`,
                    data: {
                        payment_id: paymentId,
                        course_id: courseId,
                        final_amount: 0,
                        discount_amount: validated.discount
                    }
                });
            }

            res.json({
                success: true,
                free_with_coupon: false,
                message: `ใช้คูปองได้ — ลด ฿${validated.discount.toLocaleString('th-TH')} เหลือ ฿${validated.finalAmount.toLocaleString('th-TH')}`,
                data: {
                    code: validated.coupon.code,
                    course_id: courseId,
                    course_price: validated.coursePrice,
                    discount_amount: validated.discount,
                    final_amount: validated.finalAmount
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    /** Redeem access code → enroll (source = access_code) */
    router.post('/access-codes/redeem', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const code = String(req.body.code || '').trim().toUpperCase();
        if (!code) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสเข้าเรียน' });
        }

        try {
            const pool = await poolPromise;
            const found = await pool.request()
                .input('code', sql.VarChar, code)
                .query(`
                    SELECT TOP 1
                        a.access_code_id, a.code, a.course_id, a.max_uses, a.used_count,
                        a.expires_at, a.flag_use, c.course_name_th, c.course_name_en,
                        COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name,
                        ISNULL(c.price, 0) AS price
                    FROM dbo.access_codes a
                    INNER JOIN dbo.courses c ON c.course_id = a.course_id
                    WHERE UPPER(a.code) = @code
                `);
            if (!found.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบรหัสเข้าเรียน' });
            }
            const row = found.recordset[0];
            if (!isFlagActive(row.flag_use)) {
                return res.status(400).json({ success: false, message: 'รหัสนี้ถูกปิดใช้งานแล้ว' });
            }
            if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
                return res.status(400).json({ success: false, message: 'รหัสนี้หมดอายุแล้ว' });
            }
            if (row.max_uses != null && Number(row.used_count || 0) >= Number(row.max_uses)) {
                return res.status(400).json({ success: false, message: 'รหัสนี้ถูกใช้ครบจำนวนแล้ว' });
            }

            const alreadyPaid = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, row.course_id)
                .query(`
                    SELECT TOP 1 payment_id FROM dbo.payments
                    WHERE user_id = @userId AND course_id = @courseId AND status = 'paid'
                `);
            if (alreadyPaid.recordset.length) {
                return res.json({
                    success: true,
                    already_paid: true,
                    message: 'คุณมีสิทธิ์เรียนหลักสูตรนี้อยู่แล้ว'
                });
            }

            const enrolled = await ensureEnrolled(pool, user.user_id, row.course_id);
            if (enrolled) {
                return res.json({
                    success: true,
                    already_enrolled: true,
                    message: 'คุณลงทะเบียนหลักสูตรนี้อยู่แล้ว'
                });
            }

            const reference = `CODE${Date.now()}${user.user_id}`;
            const inserted = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, row.course_id)
                .input('amount', sql.Decimal(10, 2), 0)
                .input('method', sql.VarChar, 'access_code')
                .input('source', sql.VarChar, 'access_code')
                .input('reference', sql.VarChar, reference)
                .input('accessCodeId', sql.Int, row.access_code_id)
                .query(`
                    INSERT INTO dbo.payments
                    (user_id, course_id, amount, currency, status, method, source, reference_code, access_code_id, paid_at)
                    OUTPUT INSERTED.payment_id
                    VALUES (@userId, @courseId, @amount, 'THB', 'pending', @method, @source, @reference, @accessCodeId, NULL)
                `);
            const paymentId = inserted.recordset[0].payment_id;

            await pool.request()
                .input('accessCodeId', sql.Int, row.access_code_id)
                .query(`
                    UPDATE dbo.access_codes
                    SET used_count = ISNULL(used_count, 0) + 1
                    WHERE access_code_id = @accessCodeId
                `);

            await markPaidAndEnroll(pool, user.user_id, paymentId, row.course_id);

            res.json({
                success: true,
                message: `ใช้รหัสสำเร็จ — เปิดสิทธิ์เรียนหลักสูตร ${row.course_name} แล้ว`,
                data: {
                    payment_id: paymentId,
                    course_id: row.course_id,
                    course_name: pickText(row, 'course_name', 'th'),
                    source: 'access_code'
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // แบนเนอร์หน้าแรก (สาธารณะ)
    router.get('/hero-slides', async (_req, res) => {
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT
                    slide_id, sort_order, eyebrow, section_title, section_title_highlight, lead,
                    cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href,
                    image_url, image_alt, badge_icon, badge_section_title, badge_subsection_title, theme, theme_color, flag_use
                FROM dbo.hero_slides
                WHERE ${flagActiveSql('flag_use')}
                ORDER BY ISNULL(sort_order, 999) ASC, slide_id ASC
            `);
            res.json({ success: true, data: mapHeroSlidesImages(result.recordset) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // รูปแบนเนอร์หน้าแรก (ไฟล์ใน uploads/hero/home-banner.png)
    router.get('/home-banner', (_req, res) => {
        try {
            const { getHomeBannerInfo } = require('./heroImages');
            res.json({ success: true, data: getHomeBannerInfo() });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // รายการแบนเนอร์สำหรับสไลด์หน้าแรก (หลายรูปจาก uploads/hero)
    router.get('/home-banners', (_req, res) => {
        try {
            const { listGalleryBanners } = require('./heroImages');
            const items = listGalleryBanners();
            const data = items.length
                ? items.map((x) => ({ id: x.id, url: x.url, alt: 'Banner' }))
                : [{ id: 'fallback', url: '/uploads/hero/home-banner.png', alt: 'PTS Learning' }];
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = { createLearningRouter };
