const express = require('express');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { issueEmailOtp, verifyEmailOtp } = require('./emailOtp');

const AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'avatars');
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function ensureAvatarDir() {
    fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const avatarUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            ensureAvatarDir();
            cb(null, AVATAR_DIR);
        },
        filename: (req, file, cb) => {
            const userId = req.session?.user?.user_id || 'anon';
            const ext = path.extname(file.originalname || '').toLowerCase();
            const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)
                ? (ext === '.jpeg' ? '.jpg' : ext)
                : '.jpg';
            cb(null, `user-${userId}-${Date.now()}${safeExt}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.has(String(file.mimetype || '').toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error('รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP หรือ GIF'));
        }
    }
});

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

    // อัปโหลดรูปโปรไฟล์จากไฟล์ในเครื่อง
    router.post('/profile/avatar', (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        avatarUpload.single('avatar')(req, res, async (err) => {
            if (err) {
                const message = err.code === 'LIMIT_FILE_SIZE'
                    ? 'ไฟล์ใหญ่เกิน 5MB'
                    : (err.message || 'อัปโหลดไม่สำเร็จ');
                return res.status(400).json({ success: false, message });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์รูปภาพ' });
            }

            const publicUrl = `/uploads/avatars/${req.file.filename}`;
            try {
                const pool = await poolPromise;
                const prev = await pool.request()
                    .input('userId', sql.Int, user.user_id)
                    .query(`SELECT Url FROM BD_PTS.dbo.users_main WHERE user_id = @userId`);
                const oldUrl = prev.recordset[0]?.Url || '';

                await pool.request()
                    .input('userId', sql.Int, user.user_id)
                    .input('url', sql.NVarChar, publicUrl)
                    .query(`UPDATE BD_PTS.dbo.users_main SET Url = @url WHERE user_id = @userId`);

                req.session.user.Url = publicUrl;

                // ลบไฟล์เก่าของเราเอง (ถ้าเคยอัปโหลดไว้)
                if (oldUrl && String(oldUrl).startsWith('/uploads/avatars/')) {
                    const oldPath = path.join(__dirname, '..', String(oldUrl).replace(/^\//, ''));
                    fs.promises.unlink(oldPath).catch(() => {});
                }

                res.json({
                    success: true,
                    message: 'อัปเดตรูปโปรไฟล์แล้ว',
                    url: publicUrl,
                    user: req.session.user
                });
            } catch (error) {
                fs.promises.unlink(req.file.path).catch(() => {});
                res.status(500).json({ success: false, message: error.message });
            }
        });
    });

    // ขอ OTP ทางอีเมลเพื่อเปลี่ยนรหัสผ่าน (ผู้ใช้ที่ล็อกอินแล้ว)
    router.post('/profile/password/request-otp', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`SELECT email FROM BD_PTS.dbo.users_main WHERE user_id = @userId`);
            if (!result.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
            }
            const email = String(result.recordset[0].email || '').trim();
            const issued = await issueEmailOtp(email, 'change_password');
            res.json({
                success: true,
                message: `ส่งรหัส OTP ไปที่อีเมลของคุณ ${issued.masked} แล้ว — ตรวจ inbox/สแปม หมดอายุใน 5 นาที`,
                masked_email: issued.masked,
                delivered: issued.delivered,
                expires_in_seconds: issued.expires_in_seconds
            });
        } catch (error) {
            console.error('❌ change-password request OTP:', error.message);
            const status = ['SMTP_NOT_CONFIGURED', 'MAIL_NOT_CONFIGURED', 'BREVO_NOT_CONFIGURED', 'MAIL_FROM_MISSING'].includes(error.code)
                ? 503
                : 500;
            res.status(status).json({ success: false, message: error.message, code: error.code || null });
        }
    });

    // เปลี่ยนรหัสผ่าน: ตรวจ OTP จากอีเมล + รหัสผ่านปัจจุบัน
    router.put('/profile/password', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const { current_password, new_password, otp } = req.body;
        if (!current_password || !new_password || !otp || String(new_password).length < 4) {
            return res.status(400).json({
                success: false,
                message: 'กรุณากรอกรหัสผ่านปัจจุบัน รหัสผ่านใหม่ และรหัส OTP จากอีเมล'
            });
        }
        try {
            const pool = await poolPromise;
            const profile = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`SELECT email, password_hash FROM BD_PTS.dbo.users_main WHERE user_id = @userId`);
            if (!profile.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
            }

            const row = profile.recordset[0];
            if (String(row.password_hash) !== String(current_password)) {
                return res.status(400).json({ success: false, message: 'รหัสผ่านปัจจุบันไม่ถูกต้อง' });
            }

            const checked = verifyEmailOtp(row.email, otp, 'change_password');
            if (!checked.ok) {
                return res.status(400).json({ success: false, message: checked.message });
            }

            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('pass', sql.VarChar, new_password)
                .query(`UPDATE BD_PTS.dbo.users_main SET password_hash = @pass WHERE user_id = @userId`);
            res.json({ success: true, message: 'เปลี่ยนรหัสผ่านสำเร็จ (ยืนยันด้วย OTP จากอีเมลแล้ว)' });
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
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });
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
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
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
