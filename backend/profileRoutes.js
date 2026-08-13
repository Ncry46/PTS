const express = require('express');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { flagActiveSql } = require('./db');
const { localizeCourseRow, resolveLangFromReq, courseListTextSql, courseMetaSelectSql, COURSE_API_VERSION } = require('./courseLang');
const { issueEmailOtp, verifyEmailOtp } = require('./emailOtp');
const { tryUploadLocalFile, isDriveConfigured, normalizeDriveUrl, extractDriveFileId, fetchDriveFile } = require('./googleDrive');

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

function extFromMime(mime, name) {
    const m = String(mime || '').toLowerCase();
    if (m.includes('png')) return '.png';
    if (m.includes('webp')) return '.webp';
    if (m.includes('gif')) return '.gif';
    if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
    const ext = path.extname(String(name || '')).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
        return ext === '.jpeg' ? '.jpg' : ext;
    }
    return '.jpg';
}

/** If profile Url points at Drive only, pull a local copy so <img> works again. */
async function restoreAvatarFromDriveIfNeeded(row, { pool, userId, sessionUser }) {
    const current = String(row.Url || '');
    if (!current || current.startsWith('/uploads/avatars/')) return row;
    const fileId = extractDriveFileId(current);
    if (!fileId) return row;

    try {
        const file = await fetchDriveFile(fileId);
        ensureAvatarDir();
        const filename = `user-${userId}-restored-${Date.now()}${extFromMime(file.mimeType, file.name)}`;
        const dest = path.join(AVATAR_DIR, filename);
        fs.writeFileSync(dest, file.buffer);
        const localUrl = `/uploads/avatars/${filename}`;
        await pool.request()
            .input('userId', sql.Int, userId)
            .input('url', sql.NVarChar, localUrl)
            .query(`UPDATE dbo.users SET Url = @url WHERE user_id = @userId`);
        row.Url = localUrl;
        if (sessionUser) sessionUser.Url = localUrl;
    } catch (err) {
        console.warn('[avatar] restore from Drive failed:', err.message);
        const fixed = normalizeDriveUrl(current);
        if (fixed && fixed !== current) {
            row.Url = fixed;
            try {
                await pool.request()
                    .input('userId', sql.Int, userId)
                    .input('url', sql.NVarChar, fixed)
                    .query(`UPDATE dbo.users SET Url = @url WHERE user_id = @userId`);
                if (sessionUser) sessionUser.Url = fixed;
            } catch (_) { /* ignore */ }
        }
    }
    return row;
}

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
                    SELECT user_id, email, username, phone, Role, FlagUse, Url
                    FROM dbo.users WHERE user_id = @userId
                `);
            if (!result.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
            }
            let row = result.recordset[0];
            if (row.Url) {
                row = await restoreAvatarFromDriveIfNeeded(row, {
                    pool,
                    userId: user.user_id,
                    sessionUser: req.session?.user
                });
            }
            res.json({ success: true, data: row });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    /** Public learner card for community (no email/phone) */
    router.get('/users/:userId/public', async (req, res) => {
        const userId = parseInt(req.params.userId, 10);
        if (!userId) return res.status(400).json({ success: false, message: 'รหัสผู้ใช้ไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, userId)
                .query(`
                    SELECT
                        u.user_id,
                        u.username,
                        ISNULL(u.Url, 'https://ui-avatars.com/api/?name=' + LEFT(ISNULL(u.username, N'U'), 1) + '&background=F8BBD0&color=880E4F&size=128') AS avatar_url,
                        (SELECT COUNT(*) FROM dbo.community_posts p WHERE p.user_id = u.user_id AND ${flagActiveSql('p.flag_use')}) AS post_count,
                        (SELECT COUNT(*) FROM dbo.course_enrollments e WHERE e.user_id = u.user_id) AS course_count
                    FROM dbo.users u
                    WHERE u.user_id = @userId
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
        const { username, phone, url } = req.body;
        if (!username || !String(username).trim()) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อ' });
        }
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('name', sql.NVarChar, String(username).trim())
                .input('phone', sql.VarChar, phone || '-')
                .input('url', sql.NVarChar, url || null)
                .query(`
                    UPDATE dbo.users
                    SET username = @name,
                        phone = @phone,
                        Url = COALESCE(@url, Url)
                    WHERE user_id = @userId
                `);

            req.session.user.name = String(username).trim();
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

            const localUrl = `/uploads/avatars/${req.file.filename}`;
            try {
                const pool = await poolPromise;
                const prev = await pool.request()
                    .input('userId', sql.Int, user.user_id)
                    .query(`SELECT Url FROM dbo.users WHERE user_id = @userId`);
                const oldUrl = prev.recordset[0]?.Url || '';

                // Always keep a local file for <img> display. Drive is a backup copy.
                // (Direct Drive/lh3 URLs and even the API proxy can fail in browsers.)
                let publicUrl = localUrl;
                let storedOn = 'local';
                let driveError = null;
                let driveUrl = null;
                let driveFileId = null;
                const drive = await tryUploadLocalFile(req.file.path, {
                    filename: req.file.filename,
                    mimeType: req.file.mimetype,
                    category: 'avatars'
                });
                if (drive && drive.ok && drive.fileId) {
                    storedOn = 'google_drive';
                    driveUrl = drive.url || null;
                    driveFileId = drive.fileId;
                } else if (drive && drive.error) {
                    driveError = drive.error;
                }

                await pool.request()
                    .input('userId', sql.Int, user.user_id)
                    .input('url', sql.NVarChar, publicUrl)
                    .query(`UPDATE dbo.users SET Url = @url WHERE user_id = @userId`);

                req.session.user.Url = publicUrl;

                // ลบไฟล์เก่าของเราเอง (ถ้าเคยอัปโหลดไว้ในเครื่อง)
                if (oldUrl && String(oldUrl).startsWith('/uploads/avatars/') && oldUrl !== publicUrl) {
                    const oldPath = path.join(__dirname, '..', String(oldUrl).replace(/^\//, ''));
                    fs.promises.unlink(oldPath).catch(() => {});
                }

                res.json({
                    success: true,
                    message: storedOn === 'google_drive'
                        ? 'อัปเดตรูปโปรไฟล์แล้ว (สำรองบน Google Drive แล้ว)'
                        : (driveError
                            ? `อัปเดตรูปโปรไฟล์แล้ว (เก็บในเครื่อง — Drive: ${driveError})`
                            : 'อัปเดตรูปโปรไฟล์แล้ว'),
                    url: publicUrl,
                    storage: storedOn,
                    driveConfigured: isDriveConfigured(),
                    driveError,
                    driveUrl,
                    driveFileId,
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
                .query(`SELECT email FROM dbo.users WHERE user_id = @userId`);
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
                .query(`SELECT email, password_hash FROM dbo.users WHERE user_id = @userId`);
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
                .query(`UPDATE dbo.users SET password_hash = @pass WHERE user_id = @userId`);
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
                    SELECT TOP 50 notification_id, section_title, body, link_url, is_read, created_at
                    FROM dbo.notifications
                    WHERE user_id = @userId
                    ORDER BY created_at DESC
                `);
            const data = result.recordset.map((row) => {
                const isRead = row.is_read === true || row.is_read === 1 || row.is_read === '1';
                return { ...row, is_read: isRead };
            });
            const unread = data.filter((n) => !n.is_read).length;
            res.json({ success: true, unread, data });
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
                .query(`UPDATE dbo.notifications SET is_read = 1 WHERE user_id = @userId AND is_read = 0`);
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
                .query(`UPDATE dbo.notifications SET is_read = 1 WHERE notification_id = @id AND user_id = @userId`);
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
            const lang = resolveLangFromReq(req);
            const result = await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('userId', sql.Int, userId)
                .query(`
                    SELECT
                        ${courseMetaSelectSql('c')},
                        ${courseListTextSql('c', lang)},
                        CASE WHEN @userId IS NULL THEN 0
                             WHEN EXISTS (SELECT 1 FROM dbo.course_favorites f WHERE f.user_id=@userId AND f.course_id=c.course_id) THEN 1 ELSE 0 END AS is_favorited,
                        CASE WHEN @userId IS NULL THEN 0
                             WHEN EXISTS (SELECT 1 FROM dbo.course_enrollments e WHERE e.user_id=@userId AND e.course_id=c.course_id) THEN 1 ELSE 0 END AS is_enrolled,
                        CASE WHEN @userId IS NULL THEN 0
                             WHEN EXISTS (SELECT 1 FROM dbo.payments p WHERE p.user_id=@userId AND p.course_id=c.course_id AND p.status='paid') THEN 1 ELSE 0 END AS is_paid
                FROM dbo.courses c
                WHERE c.course_id = @courseId
                  AND ${flagActiveSql('c.flag_use')}
            `);
            if (!result.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }
            const course = localizeCourseRow(result.recordset[0], lang);
            let lessons = [];
            try {
                const lessonsResult = await pool.request()
                    .input('courseId', sql.Int, courseId)
                    .query(`
                        SELECT
                            lesson_id,
                            COALESCE(
                                NULLIF(LTRIM(RTRIM(CAST(lesson_title AS NVARCHAR(255)))), N''),
                                NULLIF(LTRIM(RTRIM(CAST(section_title AS NVARCHAR(255)))), N''),
                                N'บทเรียน'
                            ) AS title,
                            section_title,
                            lesson_title,
                            sort_order,
                            duration_minutes,
                            flag_use
                        FROM dbo.course_lessons
                        WHERE course_id = @courseId
                          AND ${flagActiveSql('flag_use')}
                        ORDER BY ISNULL(sort_order, 999) ASC, lesson_id ASC
                    `);
                lessons = lessonsResult.recordset || [];
            } catch (lessonErr) {
                // Fallback for older schemas that still use title / bit flag_use
                console.warn('⚠️ course lessons (primary):', lessonErr.message);
                try {
                    const legacy = await pool.request()
                        .input('courseId', sql.Int, courseId)
                        .query(`
                            SELECT
                                lesson_id,
                                COALESCE(
                                    NULLIF(LTRIM(RTRIM(CAST(title AS NVARCHAR(255)))), N''),
                                    N'บทเรียน'
                                ) AS title,
                                title AS section_title,
                                NULL AS lesson_title,
                                sort_order,
                                duration_minutes,
                                flag_use
                            FROM dbo.course_lessons
                            WHERE course_id = @courseId
                              AND ${flagActiveSql('flag_use')}
                            ORDER BY ISNULL(sort_order, 999) ASC, lesson_id ASC
                        `);
                    lessons = legacy.recordset || [];
                } catch (legacyErr) {
                    console.warn('⚠️ course lessons (legacy):', legacyErr.message);
                    lessons = [];
                }
            }
            res.json({ success: true, loggedIn: !!userId, lang, data: course, lessons });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = { createProfileRouter };
