const express = require('express');
const sql = require('mssql');
const { seedLessonsIfEmpty } = require('./ensureSchema');

function createAdminRouter({ poolPromise, requireLogin }) {
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

    router.get('/stats', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT
                    (SELECT COUNT(*) FROM BD_PTS.dbo.users_main) AS users_count,
                    (SELECT COUNT(*) FROM BD_PTS.dbo.courses_main) AS courses_count,
                    (SELECT COUNT(*) FROM BD_PTS.dbo.course_enrollments) AS enrollments_count,
                    (SELECT COUNT(*) FROM BD_PTS.dbo.community_posts WHERE flag_use = 1) AS posts_count,
                    (SELECT COUNT(*) FROM BD_PTS.dbo.payments WHERE status = 'paid') AS paid_count,
                    (SELECT ISNULL(SUM(amount), 0) FROM BD_PTS.dbo.payments WHERE status = 'paid') AS revenue
            `);
            res.json({ success: true, data: result.recordset[0] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/users', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT TOP 200 user_id, email, full_name, phone, Role, FlagUse, Url
                FROM BD_PTS.dbo.users_main
                ORDER BY user_id DESC
            `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.patch('/users/:userId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const userId = parseInt(req.params.userId, 10);
        const { role, flag_use } = req.body;
        if (!userId) return res.status(400).json({ success: false, message: 'รหัสผู้ใช้ไม่ถูกต้อง' });

        try {
            const pool = await poolPromise;
            await pool.request()
                .input('userId', sql.Int, userId)
                .input('role', sql.VarChar, role || null)
                .input('flagUse', sql.VarChar, flag_use || null)
                .query(`
                    UPDATE BD_PTS.dbo.users_main
                    SET
                        Role = COALESCE(@role, Role),
                        FlagUse = COALESCE(@flagUse, FlagUse)
                    WHERE user_id = @userId
                `);
            res.json({ success: true, message: 'อัปเดตผู้ใช้แล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/courses', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT
                    course_id, course_name, instructor_name, delivery_mode,
                    difficulty_level, total_hours, average_rating, total_reviews,
                    cover_image_url, is_featured, created_at
                FROM BD_PTS.dbo.courses_main
                ORDER BY created_at DESC
            `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/courses', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const {
            course_name, instructor_name, delivery_mode, difficulty_level,
            total_hours, cover_image_url, is_featured
        } = req.body;

        if (!course_name) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อคอร์ส' });
        }

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('name', sql.NVarChar, course_name)
                .input('instructor', sql.NVarChar, instructor_name || 'PTS Instructor')
                .input('mode', sql.VarChar, delivery_mode || 'online')
                .input('level', sql.VarChar, difficulty_level || 'beginner')
                .input('hours', sql.Decimal(10, 2), Number(total_hours || 1))
                .input('cover', sql.NVarChar, cover_image_url || null)
                .input('featured', sql.Bit, is_featured ? 1 : 0)
                .query(`
                    INSERT INTO BD_PTS.dbo.courses_main
                    (course_name, instructor_name, delivery_mode, difficulty_level, total_hours,
                     average_rating, total_reviews, cover_image_url, is_featured, created_at)
                    OUTPUT INSERTED.course_id, INSERTED.course_name
                    VALUES (@name, @instructor, @mode, @level, @hours, 0, 0, @cover, @featured, GETDATE())
                `);

            const created = result.recordset[0];
            await seedLessonsIfEmpty(pool, created.course_id, created.course_name);
            res.json({ success: true, message: 'สร้างคอร์สสำเร็จ', data: created });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.put('/courses/:courseId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสคอร์สไม่ถูกต้อง' });

        const {
            course_name, instructor_name, delivery_mode, difficulty_level,
            total_hours, cover_image_url, is_featured
        } = req.body;

        try {
            const pool = await poolPromise;
            await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('name', sql.NVarChar, course_name || null)
                .input('instructor', sql.NVarChar, instructor_name || null)
                .input('mode', sql.VarChar, delivery_mode || null)
                .input('level', sql.VarChar, difficulty_level || null)
                .input('hours', sql.Decimal(10, 2), total_hours != null ? Number(total_hours) : null)
                .input('cover', sql.NVarChar, cover_image_url || null)
                .input('featured', sql.Bit, typeof is_featured === 'boolean' ? (is_featured ? 1 : 0) : null)
                .query(`
                    UPDATE BD_PTS.dbo.courses_main
                    SET
                        course_name = COALESCE(@name, course_name),
                        instructor_name = COALESCE(@instructor, instructor_name),
                        delivery_mode = COALESCE(@mode, delivery_mode),
                        difficulty_level = COALESCE(@level, difficulty_level),
                        total_hours = COALESCE(@hours, total_hours),
                        cover_image_url = COALESCE(@cover, cover_image_url),
                        is_featured = COALESCE(@featured, is_featured)
                    WHERE course_id = @courseId
                `);
            res.json({ success: true, message: 'อัปเดตคอร์สแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/courses/:courseId/lessons', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const courseId = parseInt(req.params.courseId, 10);
        const { title, content_html, video_url, sort_order, duration_minutes } = req.body;
        if (!courseId || !title) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุคอร์สและชื่อบทเรียน' });
        }

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('title', sql.NVarChar, title)
                .input('content', sql.NVarChar, content_html || '')
                .input('video', sql.NVarChar, video_url || null)
                .input('sort', sql.Int, Number(sort_order || 1))
                .input('duration', sql.Int, Number(duration_minutes || 15))
                .query(`
                    INSERT INTO BD_PTS.dbo.course_lessons
                    (course_id, title, content_html, video_url, sort_order, duration_minutes, flag_use)
                    OUTPUT INSERTED.lesson_id, INSERTED.title
                    VALUES (@courseId, @title, @content, @video, @sort, @duration, 1)
                `);
            res.json({ success: true, message: 'เพิ่มบทเรียนแล้ว', data: result.recordset[0] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/courses/:courseId/lessons', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const courseId = parseInt(req.params.courseId, 10);
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT lesson_id, course_id, title, content_html, video_url, sort_order, duration_minutes, flag_use
                    FROM BD_PTS.dbo.course_lessons
                    WHERE course_id = @courseId
                    ORDER BY sort_order ASC, lesson_id ASC
                `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.delete('/lessons/:lessonId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const lessonId = parseInt(req.params.lessonId, 10);
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('lessonId', sql.Int, lessonId)
                .query(`UPDATE BD_PTS.dbo.course_lessons SET flag_use = 0 WHERE lesson_id = @lessonId`);
            res.json({ success: true, message: 'ปิดการใช้งานบทเรียนแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/schedules', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT s.*, c.course_name
                FROM BD_PTS.dbo.class_schedules s
                LEFT JOIN BD_PTS.dbo.courses_main c ON c.course_id = s.course_id
                WHERE s.flag_use = 1
                ORDER BY s.start_at DESC
            `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/schedules', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const { title, course_id, start_at, end_at, location, meeting_url, delivery_mode } = req.body;
        if (!title || !start_at || !end_at) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกหัวข้อและเวลา' });
        }

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('title', sql.NVarChar, title)
                .input('courseId', sql.Int, course_id ? Number(course_id) : null)
                .input('startAt', sql.DateTime, new Date(start_at))
                .input('endAt', sql.DateTime, new Date(end_at))
                .input('location', sql.NVarChar, location || null)
                .input('meeting', sql.NVarChar, meeting_url || null)
                .input('mode', sql.VarChar, delivery_mode || 'online')
                .query(`
                    INSERT INTO BD_PTS.dbo.class_schedules
                    (course_id, title, start_at, end_at, location, meeting_url, delivery_mode, flag_use)
                    OUTPUT INSERTED.schedule_id
                    VALUES (@courseId, @title, @startAt, @endAt, @location, @meeting, @mode, 1)
                `);
            res.json({ success: true, message: 'เพิ่มตารางเรียนแล้ว', data: result.recordset[0] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.delete('/schedules/:scheduleId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const scheduleId = parseInt(req.params.scheduleId, 10);
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('scheduleId', sql.Int, scheduleId)
                .query(`UPDATE BD_PTS.dbo.class_schedules SET flag_use = 0 WHERE schedule_id = @scheduleId`);
            res.json({ success: true, message: 'ลบตารางเรียนแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/posts', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT TOP 100
                    p.post_id, p.content, p.created_at, p.flag_use, u.full_name AS author_name, u.email
                FROM BD_PTS.dbo.community_posts p
                INNER JOIN BD_PTS.dbo.users_main u ON u.user_id = p.user_id
                ORDER BY p.created_at DESC
            `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.delete('/posts/:postId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const postId = parseInt(req.params.postId, 10);
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('postId', sql.Int, postId)
                .query(`UPDATE BD_PTS.dbo.community_posts SET flag_use = 0 WHERE post_id = @postId`);
            res.json({ success: true, message: 'ซ่อนโพสต์แล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/payments', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT TOP 200
                    p.payment_id, p.amount, p.status, p.method, p.reference_code, p.paid_at, p.created_at,
                    u.full_name, u.email, c.course_name
                FROM BD_PTS.dbo.payments p
                INNER JOIN BD_PTS.dbo.users_main u ON u.user_id = p.user_id
                INNER JOIN BD_PTS.dbo.courses_main c ON c.course_id = p.course_id
                ORDER BY p.created_at DESC
            `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = { createAdminRouter };
