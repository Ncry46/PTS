const express = require('express');
const sql = require('mssql');
const { seedLessonsIfEmpty } = require('./ensureSchema');

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

    // บทเรียนของคอร์ส
    router.get('/courses/:courseId/lessons', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสคอร์สไม่ถูกต้อง' });

        try {
            const pool = await poolPromise;
            const course = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`SELECT course_id, course_name FROM BD_PTS.dbo.courses_main WHERE course_id = @courseId`);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบคอร์ส' });
            }

            await seedLessonsIfEmpty(pool, courseId, course.recordset[0].course_name);

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
                return res.status(403).json({ success: false, message: 'กรุณาสมัครเรียนคอร์สนี้ก่อนเข้าเรียน' });
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
                return res.status(403).json({ success: false, message: 'ยังไม่ได้สมัครคอร์สนี้' });
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
                      AND (
                        s.course_id IS NULL
                        OR EXISTS (
                            SELECT 1 FROM BD_PTS.dbo.course_enrollments e
                            WHERE e.user_id = @userId AND e.course_id = s.course_id
                        )
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
                        c.course_id, c.course_name, c.instructor_name, c.cover_image_url
                    FROM BD_PTS.dbo.certificates cert
                    INNER JOIN BD_PTS.dbo.courses_main c ON c.course_id = cert.course_id
                    WHERE cert.user_id = @userId
                    ORDER BY cert.issued_at DESC
                `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // ชำระเงิน (จำลอง PromptPay)
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

    router.post('/courses/:courseId/pay', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) {
            return res.status(400).json({ success: false, message: 'รหัสคอร์สไม่ถูกต้อง' });
        }

        try {
            const pool = await poolPromise;
            const course = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`SELECT course_id, course_name, ISNULL(price, 990) AS price FROM BD_PTS.dbo.courses_main WHERE course_id = @courseId`);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบคอร์ส' });
            }

            const amount = Number(req.body.amount != null ? req.body.amount : course.recordset[0].price || 990);
            if (Number.isNaN(amount) || amount < 0) {
                return res.status(400).json({ success: false, message: 'ข้อมูลการชำระเงินไม่ถูกต้อง' });
            }

            const paid = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .query(`SELECT TOP 1 payment_id FROM BD_PTS.dbo.payments WHERE user_id = @userId AND course_id = @courseId AND status = 'paid'`);
            if (paid.recordset.length) {
                return res.json({ success: true, already_paid: true, message: 'คุณชำระเงินคอร์สนี้แล้ว' });
            }

            const reference = `PAY${Date.now()}${user.user_id}`;
            const inserted = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .input('amount', sql.Decimal(10, 2), amount)
                .input('reference', sql.VarChar, reference)
                .query(`
                    INSERT INTO BD_PTS.dbo.payments
                    (user_id, course_id, amount, currency, status, method, reference_code)
                    OUTPUT INSERTED.payment_id, INSERTED.reference_code, INSERTED.amount, INSERTED.status
                    VALUES (@userId, @courseId, @amount, 'THB', 'pending', 'promptpay_mock', @reference)
                `);

            res.json({
                success: true,
                message: 'สร้างรายการชำระเงินแล้ว กรุณายืนยันการชำระ',
                data: inserted.recordset[0],
                course: course.recordset[0]
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
                    SELECT payment_id, course_id, status
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

            await pool.request()
                .input('paymentId', sql.Int, paymentId)
                .query(`UPDATE BD_PTS.dbo.payments SET status = 'paid', paid_at = GETDATE() WHERE payment_id = @paymentId`);

            // auto enroll after paid
            const enrolled = await ensureEnrolled(pool, user.user_id, row.course_id);
            if (!enrolled) {
                await pool.request()
                    .input('userId', sql.Int, user.user_id)
                    .input('courseId', sql.Int, row.course_id)
                    .query(`
                        INSERT INTO BD_PTS.dbo.course_enrollments (user_id, course_id, progress_percent, status)
                        VALUES (@userId, @courseId, 0, 'in_progress')
                    `);
            }

            await seedLessonsIfEmpty(pool, row.course_id, '');

            res.json({ success: true, message: 'ยืนยันชำระเงินสำเร็จ และเปิดสิทธิ์เรียนแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = { createLearningRouter };
