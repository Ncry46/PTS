const express = require('express');
const sql = require('mssql');
const { createNotification } = require('./ensureSchema');

function createProfileRouter({ poolPromise, requireLogin }) {
    const router = express.Router();

    router.get('/profile', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT user_id, email, full_name, phone, Role, FlagUse, Url
                    FROM BD_PTS.dbo.users_main WHERE user_id = @userId
                `);
            if (!result.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
            }
            res.json({ success: true, data: result.recordset[0] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.put('/profile', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const { full_name, phone, url } = req.body;
        if (!full_name || !String(full_name).trim()) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ' });
        }
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('name', sql.NVarChar, String(full_name).trim())
                .input('phone', sql.VarChar, phone || '-')
                .input('url', sql.NVarChar, url || null)
                .query(`
                    UPDATE BD_PTS.dbo.users_main
                    SET full_name = @name,
                        phone = @phone,
                        Url = COALESCE(@url, Url)
                    WHERE user_id = @userId
                `);

            req.session.user.name = String(full_name).trim();
            if (url) req.session.user.Url = url;

            res.json({ success: true, message: 'บันทึกโปรไฟล์แล้ว', user: req.session.user });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.put('/profile/password', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password || String(new_password).length < 4) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกรหัสผ่านใหม่ให้ถูกต้อง' });
        }
        try {
            const pool = await poolPromise;
            const check = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('pass', sql.VarChar, current_password)
                .query(`SELECT user_id FROM BD_PTS.dbo.users_main WHERE user_id = @userId AND password_hash = @pass`);
            if (!check.recordset.length) {
                return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
            }
            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('pass', sql.VarChar, new_password)
                .query(`UPDATE BD_PTS.dbo.users_main SET password_hash = @pass WHERE user_id = @userId`);
            res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/notifications', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT TOP 50 notification_id, title, body, link_url, is_read, created_at
                    FROM BD_PTS.dbo.notifications
                    WHERE user_id = @userId
                    ORDER BY created_at DESC
                `);
            const unread = result.recordset.filter(n => !n.is_read).length;
            res.json({ success: true, unread, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/notifications/read-all', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`UPDATE BD_PTS.dbo.notifications SET is_read = 1 WHERE user_id = @userId AND is_read = 0`);
            res.json({ success: true, message: 'อ่านทั้งหมดแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/notifications/:id/read', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const id = parseInt(req.params.id, 10);
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('id', sql.Int, id)
                .query(`UPDATE BD_PTS.dbo.notifications SET is_read = 1 WHERE notification_id = @id AND user_id = @userId`);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/courses/:courseId', async (req, res) => {
        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสคอร์สไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            const userId = req.session?.user?.user_id || null;
            const result = await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('userId', sql.Int, userId)
                .query(`
                    SELECT
                        c.*,
                        CASE WHEN @userId IS NULL THEN 0
                             WHEN EXISTS (SELECT 1 FROM BD_PTS.dbo.course_favorites f WHERE f.user_id=@userId AND f.course_id=c.course_id) THEN 1 ELSE 0 END AS is_favorited,
                        CASE WHEN @userId IS NULL THEN 0
                             WHEN EXISTS (SELECT 1 FROM BD_PTS.dbo.course_enrollments e WHERE e.user_id=@userId AND e.course_id=c.course_id) THEN 1 ELSE 0 END AS is_enrolled,
                        CASE WHEN @userId IS NULL THEN 0
                             WHEN EXISTS (SELECT 1 FROM BD_PTS.dbo.payments p WHERE p.user_id=@userId AND p.course_id=c.course_id AND p.status='paid') THEN 1 ELSE 0 END AS is_paid
                    FROM BD_PTS.dbo.courses_main c
                    WHERE c.course_id = @courseId
                `);
            if (!result.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบคอร์ส' });
            }
            const lessons = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT lesson_id, title, sort_order, duration_minutes
                    FROM BD_PTS.dbo.course_lessons
                    WHERE course_id = @courseId AND flag_use = 1
                    ORDER BY sort_order ASC, lesson_id ASC
                `);
            res.json({ success: true, loggedIn: !!userId, data: result.recordset[0], lessons: lessons.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = { createProfileRouter };
