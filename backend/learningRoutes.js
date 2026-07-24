const express = require('express');
const sql = require('mssql');
const { syncAfterEnroll } = require('./googleCalendar');
const { buildPromptPayPayload, getPromptPayId } = require('./promptpay');
const { mapHeroSlidesImages } = require('./heroImages');

function createLearningRouter({ poolPromise, requireLogin }) {
    const router = express.Router();

    async function recalculateCourseProgress(pool, userId, courseId) {
        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .input('courseId', sql.Int, courseId)
            .query(`
                SELECT
                    (SELECT COUNT(*) FROM BD_PTS.dbo.course_lessons WHERE course_id = @courseId AND flag_use = 1) AS total_lessons,
                    (
                        SELECT COUNT(*)
                        FROM BD_PTS.dbo.lesson_progress lp
                        INNER JOIN BD_PTS.dbo.course_lessons l ON lp.lesson_id = l.lesson_id
                        WHERE lp.user_id = @userId AND l.course_id = @courseId AND lp.completed = 1 AND l.flag_use = 1
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
                UPDATE BD_PTS.dbo.course_enrollments
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
                        SELECT 1 FROM BD_PTS.dbo.certificates WHERE user_id = @userId AND course_id = @courseId
                    )
                    INSERT INTO BD_PTS.dbo.certificates (user_id, course_id, certificate_code)
                    VALUES (@userId, @courseId, @code)
                `);
        }

        return { progress, status, total, completed };
    }

    async function ensureEnrolled(pool, userId, courseId) {
        const existing = await pool.request()
            .input('userId', sql.Int, userId)
            .input('courseId', sql.Int, courseId)
            .query(`SELECT enrollment_id FROM BD_PTS.dbo.course_enrollments WHERE user_id = @userId AND course_id = @courseId`);
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
                .query(`SELECT course_id, course_name FROM BD_PTS.dbo.courses_main WHERE course_id = @courseId`);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }

            const enrolled = await ensureEnrolled(pool, user.user_id, courseId);
            const lessons = await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT
                        l.lesson_id, l.course_id, l.title, l.video_url, l.sort_order, l.duration_minutes,
                        ISNULL(lp.completed, 0) AS completed
                    FROM BD_PTS.dbo.course_lessons l
                    LEFT JOIN BD_PTS.dbo.lesson_progress lp
                        ON lp.lesson_id = l.lesson_id AND lp.user_id = @userId
                    WHERE l.course_id = @courseId AND l.flag_use = 1
                    ORDER BY l.sort_order ASC, l.lesson_id ASC
                `);

            res.json({
                success: true,
                enrolled,
                course: course.recordset[0],
                data: lessons.recordset
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
                        l.lesson_id, l.course_id, l.title, l.content_html, l.video_url,
                        l.sort_order, l.duration_minutes, c.course_name,
                        ISNULL(lp.completed, 0) AS completed
                    FROM BD_PTS.dbo.course_lessons l
                    INNER JOIN BD_PTS.dbo.courses_main c ON c.course_id = l.course_id
                    LEFT JOIN BD_PTS.dbo.lesson_progress lp
                        ON lp.lesson_id = l.lesson_id AND lp.user_id = @userId
                    WHERE l.lesson_id = @lessonId AND l.flag_use = 1
                `);

            if (!result.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบบทเรียน' });
            }

            const lesson = result.recordset[0];
            const enrolled = await ensureEnrolled(pool, user.user_id, lesson.course_id);
            if (!enrolled && user.role !== 'admin') {
                return res.status(403).json({ success: false, message: 'กรุณาสมัครเรียนหลักสูตรนี้ก่อนเข้าเรียน' });
            }

            const siblings = await pool.request()
                .input('courseId', sql.Int, lesson.course_id)
                .query(`
                    SELECT lesson_id, title, sort_order
                    FROM BD_PTS.dbo.course_lessons
                    WHERE course_id = @courseId AND flag_use = 1
                    ORDER BY sort_order ASC, lesson_id ASC
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
                .query(`SELECT lesson_id, course_id FROM BD_PTS.dbo.course_lessons WHERE lesson_id = @lessonId AND flag_use = 1`);

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
                    IF EXISTS (SELECT 1 FROM BD_PTS.dbo.lesson_progress WHERE user_id = @userId AND lesson_id = @lessonId)
                        UPDATE BD_PTS.dbo.lesson_progress
                        SET completed = 1, completed_at = GETDATE()
                        WHERE user_id = @userId AND lesson_id = @lessonId
                    ELSE
                        INSERT INTO BD_PTS.dbo.lesson_progress (user_id, lesson_id, completed, completed_at)
                        VALUES (@userId, @lessonId, 1, GETDATE())
                `);

            const progress = await recalculateCourseProgress(pool, user.user_id, courseId);
            res.json({ success: true, message: 'บันทึกการเรียนบทนี้แล้ว', ...progress });
        } catch (error) {
            console.error('❌ complete lesson:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // ตารางเรียน
    router.get('/my/schedules', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT
                        s.schedule_id, s.title, s.start_at, s.end_at, s.location,
                        s.meeting_url, s.delivery_mode, s.course_id, c.course_name
                    FROM BD_PTS.dbo.class_schedules s
                    LEFT JOIN BD_PTS.dbo.courses_main c ON c.course_id = s.course_id
                    WHERE s.flag_use = 1
                      AND s.course_id IS NOT NULL
                      AND EXISTS (
                            SELECT 1 FROM BD_PTS.dbo.course_enrollments e
                            WHERE e.user_id = @userId AND e.course_id = s.course_id
                      )
                    ORDER BY s.start_at ASC
                `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/schedules', async (req, res) => {
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT TOP 50
                    s.schedule_id, s.title, s.start_at, s.end_at, s.location,
                    s.meeting_url, s.delivery_mode, s.course_id, c.course_name
                FROM BD_PTS.dbo.class_schedules s
                LEFT JOIN BD_PTS.dbo.courses_main c ON c.course_id = s.course_id
                WHERE s.flag_use = 1 AND s.start_at >= DATEADD(day, -1, GETDATE())
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
                        c.course_id, c.course_name, c.instructor_name, c.cover_image_url,
                        c.delivery_mode,
                        COALESCE(prog.last_completed_at, CASE WHEN e.status = 'completed' THEN e.updated_at END, cert.issued_at) AS completed_at
                    FROM BD_PTS.dbo.certificates cert
                    INNER JOIN BD_PTS.dbo.courses_main c ON c.course_id = cert.course_id
                    LEFT JOIN BD_PTS.dbo.course_enrollments e
                        ON e.user_id = cert.user_id AND e.course_id = cert.course_id
                    OUTER APPLY (
                        SELECT MAX(lp.completed_at) AS last_completed_at
                        FROM BD_PTS.dbo.lesson_progress lp
                        INNER JOIN BD_PTS.dbo.course_lessons l ON l.lesson_id = lp.lesson_id
                        WHERE lp.user_id = cert.user_id
                          AND l.course_id = cert.course_id
                          AND lp.completed = 1
                          AND l.flag_use = 1
                          AND lp.completed_at IS NOT NULL
                    ) prog
                    WHERE cert.user_id = @userId
                    ORDER BY COALESCE(prog.last_completed_at, CASE WHEN e.status = 'completed' THEN e.updated_at END, cert.issued_at) DESC
                `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    async function markPaidAndEnroll(pool, userId, paymentId, courseId) {
        await pool.request()
            .input('paymentId', sql.Int, paymentId)
            .query(`UPDATE BD_PTS.dbo.payments SET status = 'paid', paid_at = GETDATE() WHERE payment_id = @paymentId`);

        const enrolled = await ensureEnrolled(pool, userId, courseId);
        if (!enrolled) {
            await pool.request()
                .input('userId', sql.Int, userId)
                .input('courseId', sql.Int, courseId)
                .query(`
                    INSERT INTO BD_PTS.dbo.course_enrollments (user_id, course_id, progress_percent, status)
                    VALUES (@userId, @courseId, 0, 'in_progress')
                `);
            syncAfterEnroll(pool, userId, courseId).catch(() => {});
        }
    }

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
                        p.payment_id, p.amount, p.currency, p.status, p.method,
                        p.reference_code, p.paid_at, p.created_at,
                        c.course_id, c.course_name, c.cover_image_url
                    FROM BD_PTS.dbo.payments p
                    INNER JOIN BD_PTS.dbo.courses_main c ON c.course_id = p.course_id
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
                        p.payment_id, p.amount, p.currency, p.status, p.method,
                        p.reference_code, p.paid_at, p.created_at, p.course_id,
                        c.course_name
                    FROM BD_PTS.dbo.payments p
                    INNER JOIN BD_PTS.dbo.courses_main c ON c.course_id = p.course_id
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

    router.post('/courses/:courseId/pay', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) {
            return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });
        }

        const methodRaw = String(req.body.method || 'promptpay').toLowerCase();
        const method = methodRaw === 'card' ? 'card' : 'promptpay';

        try {
            const pool = await poolPromise;
            const course = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`SELECT course_id, course_name, ISNULL(price, 990) AS price FROM BD_PTS.dbo.courses_main WHERE course_id = @courseId`);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }

            const amount = Number(req.body.amount != null ? req.body.amount : course.recordset[0].price || 990);
            if (Number.isNaN(amount) || amount <= 0) {
                return res.status(400).json({ success: false, message: 'จำนวนเงินไม่ถูกต้อง' });
            }

            const paid = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .query(`SELECT TOP 1 payment_id FROM BD_PTS.dbo.payments WHERE user_id = @userId AND course_id = @courseId AND status = 'paid'`);
            if (paid.recordset.length) {
                return res.json({ success: true, already_paid: true, message: 'คุณชำระเงินหลักสูตรนี้แล้ว' });
            }

            // Reuse open pending row for same course+method when possible
            const pending = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .input('method', sql.VarChar, method)
                .query(`
                    SELECT TOP 1 payment_id, reference_code, amount, status, method
                    FROM BD_PTS.dbo.payments
                    WHERE user_id = @userId AND course_id = @courseId AND status = 'pending' AND method = @method
                    ORDER BY created_at DESC
                `);

            let paymentRow;
            if (pending.recordset.length) {
                paymentRow = pending.recordset[0];
                await pool.request()
                    .input('paymentId', sql.Int, paymentRow.payment_id)
                    .input('amount', sql.Decimal(10, 2), amount)
                    .query(`UPDATE BD_PTS.dbo.payments SET amount = @amount WHERE payment_id = @paymentId`);
                paymentRow.amount = amount;
            } else {
                const reference = `PAY${Date.now()}${user.user_id}`;
                const inserted = await pool.request()
                    .input('userId', sql.Int, user.user_id)
                    .input('courseId', sql.Int, courseId)
                    .input('amount', sql.Decimal(10, 2), amount)
                    .input('method', sql.VarChar, method)
                    .input('reference', sql.VarChar, reference)
                    .query(`
                        INSERT INTO BD_PTS.dbo.payments
                        (user_id, course_id, amount, currency, status, method, reference_code)
                        OUTPUT INSERTED.payment_id, INSERTED.reference_code, INSERTED.amount, INSERTED.status, INSERTED.method
                        VALUES (@userId, @courseId, @amount, 'THB', 'pending', @method, @reference)
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
                    ? 'สร้างรายการ PromptPay แล้ว สแกน QR เพื่อชำระ'
                    : 'พร้อมชำระด้วยบัตรเครดิต',
                data: paymentRow,
                course: course.recordset[0],
                promptpay: qrPayload ? {
                    id_masked: String(promptpayId).replace(/(\d{3})\d+(\d{3})/, '$1****$2'),
                    qr_payload: qrPayload
                } : null
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/payments/:paymentId/confirm', async (req, res) => {
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
                    SELECT payment_id, course_id, status, method
                    FROM BD_PTS.dbo.payments
                    WHERE payment_id = @paymentId AND user_id = @userId
                `);

            if (!payment.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบรายการชำระเงิน' });
            }

            const row = payment.recordset[0];
            if (row.status === 'paid') {
                return res.json({ success: true, message: 'ชำระเงินแล้วก่อนหน้านี้' });
            }
            if (row.method === 'card') {
                return res.status(400).json({
                    success: false,
                    message: 'รายการบัตรเครดิตต้องชำระผ่านฟอร์มบัตร ไม่ใช่ปุ่มยืนยันโอน'
                });
            }

            await markPaidAndEnroll(pool, user.user_id, paymentId, row.course_id);
            res.json({ success: true, message: 'ยืนยันชำระเงินสำเร็จ และเปิดสิทธิ์เรียนแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
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
                    FROM BD_PTS.dbo.payments
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

            // Demo / sandbox charge — approve valid cards (no gateway keys configured)
            await pool.request()
                .input('paymentId', sql.Int, paymentId)
                .input('method', sql.VarChar, 'card')
                .query(`UPDATE BD_PTS.dbo.payments SET method = @method WHERE payment_id = @paymentId`);

            await markPaidAndEnroll(pool, user.user_id, paymentId, row.course_id);

            const last4 = cardNumber.slice(-4);
            res.json({
                success: true,
                message: `ชำระด้วยบัตร •••• ${last4} สำเร็จ และเปิดสิทธิ์เรียนแล้ว`,
                last4
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
                    slide_id, sort_order, eyebrow, title, title_highlight, lead,
                    cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href,
                    image_url, image_alt, badge_icon, badge_title, badge_subtitle, theme, theme_color
                FROM BD_PTS.dbo.hero_slides
                WHERE flag_use = 1
                ORDER BY sort_order ASC, slide_id ASC
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

    return router;
}

module.exports = { createLearningRouter };
