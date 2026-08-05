const express = require('express');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { writeSecretsFile, readSecretsFile, readLocalMail, publicMailStatus } = require('./mailSecrets');
const { issueEmailOtp, getMailStatus } = require('./emailOtp');
const { syncScheduleToEnrolledUsers, removeScheduleFromAllCalendars } = require('./googleCalendar');
const { HERO_DIR, ensureHeroDir, mapHeroSlidesImages, HOME_BANNER_FILENAME, getHomeBannerInfo, homeBannerPath, listGalleryBanners, deleteGalleryBanner, isGalleryBannerFilename, reorderGalleryBanners, appendBannerToOrder } = require('./heroImages');
const {
    CERT_DIR,
    CERT_SLOTS,
    ensureCertDir,
    listCertAssets
} = require('./certAssets');
const { markPaidAndEnroll } = require('./paymentActions');

const HERO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const BANNER_MIME = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm'
]);
const HERO_ICONS = new Set([
    'check_circle', 'schedule', 'workspace_premium', 'school', 'star', 'verified',
    'auto_awesome', 'groups', 'event', 'menu_book', 'psychology', 'handshake'
]);
const HERO_THEMES = new Set(['rose', 'sage', 'gold', 'ink', 'ocean', 'sunset', 'custom']);

function normalizeHexColor(value) {
    const raw = String(value || '').trim();
    const m = raw.match(/^#?([0-9a-fA-F]{6})$/);
    if (!m) return null;
    return `#${m[1].toLowerCase()}`;
}

const heroUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            ensureHeroDir();
            cb(null, HERO_DIR);
        },
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname || '').toLowerCase();
            const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)
                ? (ext === '.jpeg' ? '.jpg' : ext)
                : '.jpg';
            cb(null, `hero-${Date.now()}${safeExt}`);
        }
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (HERO_MIME.has(String(file.mimetype || '').toLowerCase())) cb(null, true);
        else cb(new Error('รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP หรือ GIF'));
    }
});

function normalizeHeroBody(body = {}) {
    const icon = String(body.badge_icon || '').trim() || 'check_circle';
    let theme = String(body.theme || '').trim().toLowerCase() || 'rose';
    if (!HERO_THEMES.has(theme)) theme = 'rose';
    const themeColor = normalizeHexColor(body.theme_color || body.themeColor || '');
    if (theme === 'custom' && !themeColor) {
        theme = 'rose';
    }
    return {
        sort_order: Math.max(1, parseInt(body.sort_order, 10) || 1),
        eyebrow: String(body.eyebrow || '').trim() || null,
        title: String(body.title || '').trim(),
        title_highlight: String(body.title_highlight || '').trim() || null,
        lead: String(body.lead || '').trim() || null,
        cta_primary_label: String(body.cta_primary_label || '').trim() || null,
        cta_primary_href: String(body.cta_primary_href || '').trim() || null,
        cta_secondary_label: String(body.cta_secondary_label || '').trim() || null,
        cta_secondary_href: String(body.cta_secondary_href || '').trim() || null,
        image_url: String(body.image_url || '').trim() || null,
        image_alt: String(body.image_alt || '').trim() || null,
        badge_icon: HERO_ICONS.has(icon) ? icon : 'check_circle',
        badge_title: String(body.badge_title || '').trim() || null,
        badge_subtitle: String(body.badge_subtitle || '').trim() || null,
        theme,
        theme_color: theme === 'custom' ? themeColor : (themeColor || null),
        flag_use: body.flag_use === false || body.flag_use === 0 || body.flag_use === '0' ? 0 : 1
    };
}

function bindHeroInputs(request, data) {
    return request
        .input('sort_order', sql.Int, data.sort_order)
        .input('eyebrow', sql.NVarChar, data.eyebrow)
        .input('title', sql.NVarChar, data.title)
        .input('title_highlight', sql.NVarChar, data.title_highlight)
        .input('lead', sql.NVarChar, data.lead)
        .input('cta_primary_label', sql.NVarChar, data.cta_primary_label)
        .input('cta_primary_href', sql.NVarChar, data.cta_primary_href)
        .input('cta_secondary_label', sql.NVarChar, data.cta_secondary_label)
        .input('cta_secondary_href', sql.NVarChar, data.cta_secondary_href)
        .input('image_url', sql.NVarChar, data.image_url)
        .input('image_alt', sql.NVarChar, data.image_alt)
        .input('badge_icon', sql.NVarChar, data.badge_icon)
        .input('badge_title', sql.NVarChar, data.badge_title)
        .input('badge_subtitle', sql.NVarChar, data.badge_subtitle)
        .input('theme', sql.NVarChar, data.theme)
        .input('theme_color', sql.NVarChar, data.theme_color)
        .input('flag_use', sql.Bit, data.flag_use);
}

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
                    course_id,
                    course_name,
                    instructor_name,
                    delivery_mode,
                    total_hours,
                    average_rating,
                    total_reviews,
                    cover_image_url,
                    is_featured,
                    coursesFlag,
                    created_at,
                    price,
                    description,
                    flag_use,
                    coursescat_id,
                    total_enrolled,
                    start_date,
                    is_open_soon
                FROM BD_PTS.dbo.courses_main
                WHERE ISNULL(flag_use, 1) = 1
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
            course_name, instructor_name, delivery_mode,
            total_hours, cover_image_url, is_featured,
            coursesFlag, price, description, coursescat_id,
            total_enrolled, start_date, is_open_soon
        } = req.body;

        if (!course_name) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อหลักสูตร' });
        }

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('name', sql.NVarChar, course_name)
                .input('instructor', sql.NVarChar, instructor_name || 'PTS Instructor')
                .input('mode', sql.VarChar, delivery_mode || 'online')
                .input('hours', sql.Decimal(10, 2), Number(total_hours || 1))
                .input('cover', sql.NVarChar, cover_image_url || null)
                .input('featured', sql.Bit, is_featured ? 1 : 0)
                .input('coursesFlag', sql.NVarChar, coursesFlag != null && coursesFlag !== '' ? String(coursesFlag) : 'Y')
                .input('price', sql.Decimal(10, 2), price != null && price !== '' ? Number(price) : null)
                .input('description', sql.NVarChar, description || null)
                .input('catId', sql.Int, coursescat_id != null && coursescat_id !== '' ? Number(coursescat_id) : null)
                .input('enrolled', sql.Int, total_enrolled != null && total_enrolled !== '' ? Number(total_enrolled) : 0)
                .input('startDate', sql.Date, start_date || null)
                .input('openSoon', sql.Bit, is_open_soon ? 1 : 0)
                .query(`
                    INSERT INTO BD_PTS.dbo.courses_main
                    (course_name, instructor_name, delivery_mode, total_hours,
                     average_rating, total_reviews, cover_image_url, is_featured,
                     coursesFlag, created_at, price, description, flag_use,
                     coursescat_id, total_enrolled, start_date, is_open_soon)
                    OUTPUT INSERTED.course_id, INSERTED.course_name
                    VALUES (
                        @name, @instructor, @mode, @hours,
                        0, 0, @cover, @featured,
                        @coursesFlag, GETDATE(), @price, @description, 1,
                        @catId, @enrolled, @startDate, @openSoon
                    )
                `);

            const created = result.recordset[0];
            res.json({ success: true, message: 'สร้างหลักสูตรสำเร็จ', data: created });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.put('/courses/:courseId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });

        const body = req.body || {};

        try {
            const pool = await poolPromise;
            await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('name', sql.NVarChar, body.course_name != null ? body.course_name : null)
                .input('instructor', sql.NVarChar, body.instructor_name != null ? body.instructor_name : null)
                .input('mode', sql.VarChar, body.delivery_mode != null ? body.delivery_mode : null)
                .input('hours', sql.Decimal(10, 2), body.total_hours != null && body.total_hours !== '' ? Number(body.total_hours) : null)
                .input('cover', sql.NVarChar, body.cover_image_url !== undefined ? (body.cover_image_url || null) : null)
                .input('hasCover', sql.Bit, body.cover_image_url !== undefined ? 1 : 0)
                .input('featured', sql.Bit, typeof body.is_featured === 'boolean' ? (body.is_featured ? 1 : 0) : null)
                .input('coursesFlag', sql.NVarChar, body.coursesFlag !== undefined ? (body.coursesFlag || null) : null)
                .input('hasFlag', sql.Bit, body.coursesFlag !== undefined ? 1 : 0)
                .input('price', sql.Decimal(10, 2), body.price !== undefined && body.price !== '' && body.price != null ? Number(body.price) : null)
                .input('hasPrice', sql.Bit, body.price !== undefined ? 1 : 0)
                .input('description', sql.NVarChar, body.description !== undefined ? (body.description || null) : null)
                .input('hasDesc', sql.Bit, body.description !== undefined ? 1 : 0)
                .input('catId', sql.Int, body.coursescat_id !== undefined && body.coursescat_id !== '' && body.coursescat_id != null ? Number(body.coursescat_id) : null)
                .input('hasCat', sql.Bit, body.coursescat_id !== undefined ? 1 : 0)
                .input('enrolled', sql.Int, body.total_enrolled !== undefined && body.total_enrolled !== '' ? Number(body.total_enrolled) : null)
                .input('startDate', sql.Date, body.start_date !== undefined ? (body.start_date || null) : null)
                .input('hasStart', sql.Bit, body.start_date !== undefined ? 1 : 0)
                .input('openSoon', sql.Bit, typeof body.is_open_soon === 'boolean' ? (body.is_open_soon ? 1 : 0) : null)
                .query(`
                    UPDATE BD_PTS.dbo.courses_main
                    SET
                        course_name = COALESCE(@name, course_name),
                        instructor_name = COALESCE(@instructor, instructor_name),
                        delivery_mode = COALESCE(@mode, delivery_mode),
                        total_hours = COALESCE(@hours, total_hours),
                        cover_image_url = CASE WHEN @hasCover = 1 THEN @cover ELSE cover_image_url END,
                        is_featured = COALESCE(@featured, is_featured),
                        coursesFlag = CASE WHEN @hasFlag = 1 THEN @coursesFlag ELSE coursesFlag END,
                        price = CASE WHEN @hasPrice = 1 THEN @price ELSE price END,
                        description = CASE WHEN @hasDesc = 1 THEN @description ELSE description END,
                        coursescat_id = CASE WHEN @hasCat = 1 THEN @catId ELSE coursescat_id END,
                        total_enrolled = COALESCE(@enrolled, total_enrolled),
                        start_date = CASE WHEN @hasStart = 1 THEN @startDate ELSE start_date END,
                        is_open_soon = COALESCE(@openSoon, is_open_soon)
                    WHERE course_id = @courseId
                `);
            res.json({ success: true, message: 'อัปเดตหลักสูตรแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.delete('/courses/:courseId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`
                    UPDATE BD_PTS.dbo.courses_main
                    SET flag_use = 0
                    WHERE course_id = @courseId AND ISNULL(flag_use, 1) = 1
                `);
            if (!result.rowsAffected?.[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร หรือถูกลบไปแล้ว' });
            }
            res.json({ success: true, message: 'ลบหลักสูตรแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/courses/:courseId/lessons', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const courseId = parseInt(req.params.courseId, 10);
        const { title, content_html, video_url, sort_order, duration_minutes } = req.body;
        if (!courseId || !title) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุหลักสูตรและชื่อบทเรียน' });
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
                    WHERE course_id = @courseId AND ISNULL(flag_use, 1) = 1
                    ORDER BY sort_order ASC, lesson_id ASC
                `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.put('/lessons/:lessonId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const lessonId = parseInt(req.params.lessonId, 10);
        if (!lessonId) return res.status(400).json({ success: false, message: 'รหัสบทเรียนไม่ถูกต้อง' });

        const { title, content_html, video_url, sort_order, duration_minutes } = req.body;
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('lessonId', sql.Int, lessonId)
                .input('title', sql.NVarChar, title || null)
                .input('content', sql.NVarChar, content_html != null ? content_html : null)
                .input('video', sql.NVarChar, video_url != null ? video_url : null)
                .input('sort', sql.Int, sort_order != null ? Number(sort_order) : null)
                .input('duration', sql.Int, duration_minutes != null ? Number(duration_minutes) : null)
                .query(`
                    UPDATE BD_PTS.dbo.course_lessons
                    SET
                        title = COALESCE(@title, title),
                        content_html = COALESCE(@content, content_html),
                        video_url = COALESCE(@video, video_url),
                        sort_order = COALESCE(@sort, sort_order),
                        duration_minutes = COALESCE(@duration, duration_minutes)
                    WHERE lesson_id = @lessonId AND ISNULL(flag_use, 1) = 1
                `);
            if (!result.rowsAffected?.[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบบทเรียน หรือถูกลบไปแล้ว' });
            }
            res.json({ success: true, message: 'อัปเดตบทเรียนแล้ว' });
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
        if (!course_id) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกหลักสูตรที่ผูกตาราง (จำเป็นสำหรับซิงค์ปฏิทินนักเรียน)' });
        }

        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('title', sql.NVarChar, title)
                .input('courseId', sql.Int, Number(course_id))
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
            const scheduleId = result.recordset[0].schedule_id;
            syncScheduleToEnrolledUsers(pool, scheduleId).catch(() => {});
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
            removeScheduleFromAllCalendars(pool, scheduleId).catch(() => {});
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
                SELECT TOP 200
                    p.post_id, p.user_id, p.content, p.created_at, p.flag_use,
                    u.full_name AS author_name, u.email
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

    router.patch('/posts/:postId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const postId = parseInt(req.params.postId, 10);
        if (!postId) return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });

        const visible = !(req.body.flag_use === false || req.body.flag_use === 0 || req.body.flag_use === '0');
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('postId', sql.Int, postId)
                .input('flag', sql.Bit, visible ? 1 : 0)
                .query(`
                    UPDATE BD_PTS.dbo.community_posts
                    SET flag_use = @flag
                    WHERE post_id = @postId
                `);
            if (!result.rowsAffected?.[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบโพสต์' });
            }
            res.json({
                success: true,
                message: visible ? 'แสดงโพสต์อีกครั้งแล้ว' : 'ซ่อนโพสต์แล้ว'
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/payments', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const statusFilter = String(req.query.status || '').trim().toLowerCase();
            const sourceFilter = String(req.query.source || '').trim().toLowerCase();
            const request = pool.request();
            let where = 'WHERE 1=1';
            if (statusFilter === 'pending' || statusFilter === 'pending_review') {
                where += ` AND p.status = 'pending_review'`;
            } else if (statusFilter === 'paid') {
                where += ` AND p.status = 'paid'`;
            } else if (statusFilter === 'rejected') {
                where += ` AND p.status = 'rejected'`;
            } else if (statusFilter === 'open') {
                where += ` AND p.status IN ('pending', 'pending_review')`;
            }
            if (sourceFilter === 'direct_signup' || sourceFilter === 'access_code') {
                request.input('source', sql.VarChar, sourceFilter);
                where += ' AND ISNULL(p.source, \'direct_signup\') = @source';
            }
            const result = await request.query(`
                SELECT TOP 300
                    p.payment_id, p.user_id, p.course_id, p.amount, p.status, p.method,
                    ISNULL(p.source, 'direct_signup') AS source,
                    p.reference_code, p.paid_at, p.created_at,
                    p.slip_image_url, p.transfer_at, p.reviewed_by, p.reviewed_at, p.reject_reason,
                    p.access_code_id,
                    u.full_name, u.email,
                    c.course_name,
                    reviewer.full_name AS reviewer_name,
                    ac.code AS access_code
                FROM BD_PTS.dbo.payments p
                INNER JOIN BD_PTS.dbo.users_main u ON u.user_id = p.user_id
                INNER JOIN BD_PTS.dbo.courses_main c ON c.course_id = p.course_id
                LEFT JOIN BD_PTS.dbo.users_main reviewer ON reviewer.user_id = p.reviewed_by
                LEFT JOIN BD_PTS.dbo.access_codes ac ON ac.access_code_id = p.access_code_id
                ${where}
                ORDER BY
                    CASE WHEN p.status = 'pending_review' THEN 0
                         WHEN p.status = 'pending' THEN 1
                         WHEN p.status = 'rejected' THEN 2
                         ELSE 3 END,
                    COALESCE(p.transfer_at, p.created_at) DESC
            `);

            const rows = result.recordset.map((p) => {
                const method = String(p.method || '').toLowerCase();
                const status = String(p.status || '').toLowerCase();
                const isGateway = method === 'card';
                const isManual = method === 'promptpay' || method === 'bank_transfer';
                let workflow = 'other';
                if (status === 'pending_review') workflow = 'pending_review';
                else if (status === 'paid' && isGateway) workflow = 'auto_approved';
                else if (status === 'paid' && String(p.source) === 'access_code') workflow = 'access_code';
                else if (status === 'paid' && isManual && p.reviewed_by) workflow = 'manual_approved';
                else if (status === 'paid') workflow = 'paid';
                else if (status === 'rejected') workflow = 'rejected';
                else if (status === 'pending') workflow = 'awaiting_payment';
                return { ...p, workflow, is_gateway: isGateway, is_manual_transfer: isManual };
            });

            const counts = {
                pending_review: rows.filter((r) => r.status === 'pending_review').length,
                paid: rows.filter((r) => r.status === 'paid').length,
                rejected: rows.filter((r) => r.status === 'rejected').length,
                all: rows.length
            };

            res.json({ success: true, data: rows, counts });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/payments/:id/approve', async (req, res) => {
        const admin = requireAdmin(req, res);
        if (!admin) return;
        const paymentId = parseInt(req.params.id, 10);
        if (!paymentId) return res.status(400).json({ success: false, message: 'รหัสรายการไม่ถูกต้อง' });

        try {
            const pool = await poolPromise;
            const payment = await pool.request()
                .input('paymentId', sql.Int, paymentId)
                .query(`
                    SELECT payment_id, user_id, course_id, status, method, slip_image_url
                    FROM BD_PTS.dbo.payments
                    WHERE payment_id = @paymentId
                `);
            if (!payment.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบรายการชำระเงิน' });
            }
            const row = payment.recordset[0];
            if (row.status === 'paid') {
                return res.json({ success: true, message: 'รายการนี้ได้รับการอนุมัติแล้วก่อนหน้านี้' });
            }
            if (row.status !== 'pending_review' && row.status !== 'pending' && row.status !== 'rejected') {
                return res.status(400).json({ success: false, message: 'สถานะรายการนี้ไม่อนุมัติได้' });
            }

            await markPaidAndEnroll(pool, row.user_id, paymentId, row.course_id, {
                reviewedBy: admin.user_id
            });

            res.json({
                success: true,
                message: 'อนุมัติแล้ว — เปิดสิทธิ์คอร์สให้นักเรียนและส่งการแจ้งเตือนแล้ว'
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/payments/:id/reject', async (req, res) => {
        const admin = requireAdmin(req, res);
        if (!admin) return;
        const paymentId = parseInt(req.params.id, 10);
        if (!paymentId) return res.status(400).json({ success: false, message: 'รหัสรายการไม่ถูกต้อง' });
        const reason = String(req.body.reason || '').trim() || 'สลิปไม่ถูกต้องหรือยอดไม่ตรง';

        try {
            const pool = await poolPromise;
            const payment = await pool.request()
                .input('paymentId', sql.Int, paymentId)
                .query(`
                    SELECT payment_id, user_id, course_id, status
                    FROM BD_PTS.dbo.payments
                    WHERE payment_id = @paymentId
                `);
            if (!payment.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบรายการชำระเงิน' });
            }
            const row = payment.recordset[0];
            if (row.status === 'paid') {
                return res.status(400).json({ success: false, message: 'รายการที่อนุมัติแล้ว ไม่สามารถปฏิเสธได้' });
            }

            await pool.request()
                .input('paymentId', sql.Int, paymentId)
                .input('reason', sql.NVarChar, reason.slice(0, 500))
                .input('reviewedBy', sql.Int, admin.user_id)
                .query(`
                    UPDATE BD_PTS.dbo.payments
                    SET status = 'rejected',
                        reject_reason = @reason,
                        reviewed_by = @reviewedBy,
                        reviewed_at = GETDATE()
                    WHERE payment_id = @paymentId
                `);

            const { createNotification } = require('./ensureSchema');
            await createNotification(
                pool,
                row.user_id,
                'การชำระเงินไม่ผ่านการตรวจสอบ',
                reason,
                'Payments.html'
            ).catch(() => {});

            res.json({ success: true, message: 'ปฏิเสธรายการแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/access-codes', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT TOP 200
                    a.access_code_id, a.code, a.course_id, a.max_uses, a.used_count,
                    a.expires_at, a.note, a.flag_use, a.created_at, a.created_by,
                    c.course_name, u.full_name AS created_by_name
                FROM BD_PTS.dbo.access_codes a
                INNER JOIN BD_PTS.dbo.courses_main c ON c.course_id = a.course_id
                LEFT JOIN BD_PTS.dbo.users_main u ON u.user_id = a.created_by
                ORDER BY a.created_at DESC
            `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/access-codes', async (req, res) => {
        const admin = requireAdmin(req, res);
        if (!admin) return;
        const courseId = parseInt(req.body.course_id, 10);
        let code = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
        const note = String(req.body.note || '').trim().slice(0, 255) || null;
        const maxUsesRaw = req.body.max_uses;
        const maxUses = maxUsesRaw === '' || maxUsesRaw == null ? null : parseInt(maxUsesRaw, 10);
        const expiresRaw = String(req.body.expires_at || '').trim();

        if (!courseId) return res.status(400).json({ success: false, message: 'เลือกหลักสูตรก่อน' });
        if (!code) {
            code = `PTS-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        }
        if (code.length < 4) return res.status(400).json({ success: false, message: 'รหัสสั้นเกินไป' });
        if (maxUses != null && (Number.isNaN(maxUses) || maxUses < 1)) {
            return res.status(400).json({ success: false, message: 'จำนวนครั้งใช้ไม่ถูกต้อง' });
        }

        let expiresAt = null;
        if (expiresRaw) {
            const d = new Date(expiresRaw);
            if (Number.isNaN(d.getTime())) {
                return res.status(400).json({ success: false, message: 'วันหมดอายุไม่ถูกต้อง' });
            }
            expiresAt = d;
        }

        try {
            const pool = await poolPromise;
            const course = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`SELECT course_id, course_name FROM BD_PTS.dbo.courses_main WHERE course_id = @courseId`);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }

            const inserted = await pool.request()
                .input('code', sql.VarChar, code)
                .input('courseId', sql.Int, courseId)
                .input('maxUses', sql.Int, maxUses)
                .input('expiresAt', sql.DateTime, expiresAt)
                .input('note', sql.NVarChar, note)
                .input('createdBy', sql.Int, admin.user_id)
                .query(`
                    INSERT INTO BD_PTS.dbo.access_codes
                    (code, course_id, max_uses, used_count, expires_at, note, flag_use, created_by)
                    OUTPUT INSERTED.access_code_id, INSERTED.code, INSERTED.course_id, INSERTED.max_uses,
                           INSERTED.used_count, INSERTED.expires_at, INSERTED.note, INSERTED.flag_use, INSERTED.created_at
                    VALUES (@code, @courseId, @maxUses, 0, @expiresAt, @note, 1, @createdBy)
                `);

            res.json({
                success: true,
                message: 'สร้างรหัสเข้าเรียนแล้ว',
                data: { ...inserted.recordset[0], course_name: course.recordset[0].course_name }
            });
        } catch (error) {
            if (String(error.message || '').includes('UQ_access_codes_code') || String(error.number) === '2627') {
                return res.status(409).json({ success: false, message: 'รหัสนี้มีอยู่แล้ว' });
            }
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.patch('/access-codes/:id', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ success: false, message: 'รหัสไม่ถูกต้อง' });
        const flag = req.body.flag_use;
        if (flag !== 0 && flag !== 1 && flag !== true && flag !== false) {
            return res.status(400).json({ success: false, message: 'ระบุ flag_use เป็น 0 หรือ 1' });
        }
        try {
            const pool = await poolPromise;
            const result = await pool.request()
                .input('id', sql.Int, id)
                .input('flag', sql.Bit, flag ? 1 : 0)
                .query(`
                    UPDATE BD_PTS.dbo.access_codes SET flag_use = @flag
                    WHERE access_code_id = @id
                `);
            if (!result.rowsAffected?.[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบรหัส' });
            }
            res.json({ success: true, message: flag ? 'เปิดใช้รหัสแล้ว' : 'ปิดใช้รหัสแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // —— Home hero slides ——
    router.get('/hero-slides', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT
                    slide_id, sort_order, eyebrow, title, title_highlight, lead,
                    cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href,
                    image_url, image_alt, badge_icon, badge_title, badge_subtitle, theme, theme_color,
                    flag_use, created_at, updated_at
                FROM BD_PTS.dbo.hero_slides
                ORDER BY sort_order ASC, slide_id ASC
            `);
            res.json({ success: true, data: mapHeroSlidesImages(result.recordset) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/hero-slides', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const data = normalizeHeroBody(req.body);
        if (!data.title) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุหัวข้อแบนเนอร์' });
        }
        try {
            const pool = await poolPromise;
            const result = await bindHeroInputs(pool.request(), data).query(`
                INSERT INTO BD_PTS.dbo.hero_slides (
                    sort_order, eyebrow, title, title_highlight, lead,
                    cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href,
                    image_url, image_alt, badge_icon, badge_title, badge_subtitle, theme, theme_color, flag_use
                )
                OUTPUT INSERTED.slide_id
                VALUES (
                    @sort_order, @eyebrow, @title, @title_highlight, @lead,
                    @cta_primary_label, @cta_primary_href, @cta_secondary_label, @cta_secondary_href,
                    @image_url, @image_alt, @badge_icon, @badge_title, @badge_subtitle, @theme, @theme_color, @flag_use
                )
            `);
            res.json({ success: true, message: 'เพิ่มแบนเนอร์แล้ว', data: result.recordset[0] });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.put('/hero-slides/:slideId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const slideId = parseInt(req.params.slideId, 10);
        if (!slideId) return res.status(400).json({ success: false, message: 'รหัสแบนเนอร์ไม่ถูกต้อง' });
        const data = normalizeHeroBody(req.body);
        if (!data.title) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุหัวข้อแบนเนอร์' });
        }
        try {
            const pool = await poolPromise;
            const result = await bindHeroInputs(pool.request(), data)
                .input('slideId', sql.Int, slideId)
                .query(`
                    UPDATE BD_PTS.dbo.hero_slides
                    SET sort_order = @sort_order,
                        eyebrow = @eyebrow,
                        title = @title,
                        title_highlight = @title_highlight,
                        lead = @lead,
                        cta_primary_label = @cta_primary_label,
                        cta_primary_href = @cta_primary_href,
                        cta_secondary_label = @cta_secondary_label,
                        cta_secondary_href = @cta_secondary_href,
                        image_url = @image_url,
                        image_alt = @image_alt,
                        badge_icon = @badge_icon,
                        badge_title = @badge_title,
                        badge_subtitle = @badge_subtitle,
                        theme = @theme,
                        theme_color = @theme_color,
                        flag_use = @flag_use,
                        updated_at = GETDATE()
                    WHERE slide_id = @slideId
                `);
            if (!result.rowsAffected[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบแบนเนอร์' });
            }
            res.json({ success: true, message: 'บันทึกแบนเนอร์แล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.delete('/hero-slides/:slideId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const slideId = parseInt(req.params.slideId, 10);
        if (!slideId) return res.status(400).json({ success: false, message: 'รหัสแบนเนอร์ไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('slideId', sql.Int, slideId)
                .query(`
                    UPDATE BD_PTS.dbo.hero_slides
                    SET flag_use = 0, updated_at = GETDATE()
                    WHERE slide_id = @slideId
                `);
            res.json({ success: true, message: 'ซ่อนแบนเนอร์แล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // เปลี่ยนสี / แสดง-ซ่อน แบบเร็ว โดยไม่ต้องส่งฟอร์มทั้งชุด
    router.patch('/hero-slides/:slideId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const slideId = parseInt(req.params.slideId, 10);
        if (!slideId) return res.status(400).json({ success: false, message: 'รหัสแบนเนอร์ไม่ถูกต้อง' });

        const sets = [];
        const inputs = [];

        if (req.body.theme != null) {
            const theme = String(req.body.theme || '').trim().toLowerCase();
            if (!HERO_THEMES.has(theme)) {
                return res.status(400).json({ success: false, message: 'ธีมสีไม่ถูกต้อง' });
            }
            sets.push('theme = @theme');
            inputs.push(['theme', sql.NVarChar, theme]);
        }
        if (req.body.theme_color != null || req.body.themeColor != null) {
            const raw = req.body.theme_color != null ? req.body.theme_color : req.body.themeColor;
            if (String(raw || '').trim() === '') {
                sets.push('theme_color = @theme_color');
                inputs.push(['theme_color', sql.NVarChar, null]);
            } else {
                const themeColor = normalizeHexColor(raw);
                if (!themeColor) {
                    return res.status(400).json({ success: false, message: 'รหัสสีไม่ถูกต้อง (ใช้เช่น #974258)' });
                }
                sets.push('theme_color = @theme_color');
                inputs.push(['theme_color', sql.NVarChar, themeColor]);
                if (req.body.theme == null) {
                    sets.push('theme = @theme');
                    inputs.push(['theme', sql.NVarChar, 'custom']);
                }
            }
        }
        if (req.body.flag_use != null) {
            const flag = req.body.flag_use === false || req.body.flag_use === 0 || req.body.flag_use === '0' ? 0 : 1;
            sets.push('flag_use = @flag_use');
            inputs.push(['flag_use', sql.Bit, flag]);
        }
        if (req.body.sort_order != null) {
            const sort = Math.max(1, parseInt(req.body.sort_order, 10) || 1);
            sets.push('sort_order = @sort_order');
            inputs.push(['sort_order', sql.Int, sort]);
        }
        if (!sets.length) {
            return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่จะอัปเดต' });
        }
        sets.push('updated_at = GETDATE()');

        try {
            const pool = await poolPromise;
            let request = pool.request().input('slideId', sql.Int, slideId);
            inputs.forEach(([name, type, value]) => {
                request = request.input(name, type, value);
            });
            const result = await request.query(`
                UPDATE BD_PTS.dbo.hero_slides
                SET ${sets.join(', ')}
                WHERE slide_id = @slideId
            `);
            if (!result.rowsAffected[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบแบนเนอร์' });
            }
            res.json({ success: true, message: 'อัปเดตแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/hero-slides/upload', (req, res) => {
        if (!requireAdmin(req, res)) return;
        heroUpload.single('image')(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message || 'อัปโหลดไม่สำเร็จ' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์รูป' });
            }
            res.json({ success: true, url: `/uploads/hero/${req.file.filename}` });
        });
    });

    /** แบนเนอร์หน้าแรก — รองรับรูปนิ่ง / GIF·WebP เคลื่อนไหว / วิดีโอ MP4·WebM */
    const galleryBannerUpload = multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => {
                ensureHeroDir();
                cb(null, HERO_DIR);
            },
            filename: (_req, file, cb) => {
                const ext = path.extname(file.originalname || '').toLowerCase();
                const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.mp4', '.webm'].includes(ext)
                    ? (ext === '.jpeg' ? '.jpg' : ext)
                    : '.png';
                cb(null, `banner-${Date.now()}${safeExt}`);
            }
        }),
        limits: { fileSize: 48 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (BANNER_MIME.has(String(file.mimetype || '').toLowerCase())) cb(null, true);
            else cb(new Error('รองรับ JPG, PNG, WEBP, GIF, MP4 หรือ WEBM'));
        }
    });

    router.get('/home-banners', (req, res) => {
        if (!requireAdmin(req, res)) return;
        res.json({ success: true, data: listGalleryBanners() });
    });

    router.post('/home-banners/upload', (req, res) => {
        if (!requireAdmin(req, res)) return;
        galleryBannerUpload.single('image')(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message || 'อัปโหลดไม่สำเร็จ' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์รูปหรือวิดีโอ' });
            }
            try { appendBannerToOrder(req.file.filename); } catch (_) { /* ignore */ }
            const items = listGalleryBanners();
            const item = items.find((x) => x.filename === req.file.filename) || {
                filename: req.file.filename,
                url: `/uploads/hero/${req.file.filename}`
            };
            res.json({
                success: true,
                message: 'เพิ่มแบนเนอร์แล้ว',
                data: item,
                list: items
            });
        });
    });

    router.put('/home-banners/reorder', (req, res) => {
        if (!requireAdmin(req, res)) return;
        const order = req.body?.order || req.body?.filenames || req.body;
        if (!Array.isArray(order) || !order.length) {
            return res.status(400).json({ success: false, message: 'กรุณาส่งลำดับไฟล์แบนเนอร์' });
        }
        try {
            const data = reorderGalleryBanners(order);
            res.json({ success: true, message: 'อัปเดตลำดับแบนเนอร์แล้ว', data });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message || 'เรียงลำดับไม่สำเร็จ' });
        }
    });

    router.delete('/home-banners/:filename', (req, res) => {
        if (!requireAdmin(req, res)) return;
        const result = deleteGalleryBanner(req.params.filename);
        if (!result.ok) {
            return res.status(400).json({ success: false, message: result.message || 'ลบไม่สำเร็จ' });
        }
        res.json({ success: true, message: 'ลบแบนเนอร์แล้ว', data: listGalleryBanners() });
    });

    /** แบนเนอร์หน้าแรก — บันทึกเป็นไฟล์คงที่ uploads/hero/home-banner.png (legacy) */
    const homeBannerUpload = multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => {
                ensureHeroDir();
                cb(null, HERO_DIR);
            },
            filename: (_req, _file, cb) => {
                const dest = homeBannerPath();
                try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch (_) { /* ignore */ }
                cb(null, HOME_BANNER_FILENAME);
            }
        }),
        limits: { fileSize: 12 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (HERO_MIME.has(String(file.mimetype || '').toLowerCase())) cb(null, true);
            else cb(new Error('รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP หรือ GIF'));
        }
    });

    router.get('/home-banner', (req, res) => {
        if (!requireAdmin(req, res)) return;
        res.json({ success: true, data: getHomeBannerInfo() });
    });

    router.post('/home-banner/upload', (req, res) => {
        if (!requireAdmin(req, res)) return;
        homeBannerUpload.single('image')(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message || 'อัปโหลดไม่สำเร็จ' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์รูป' });
            }
            const info = getHomeBannerInfo();
            res.json({
                success: true,
                message: 'บันทึกแบนเนอร์หน้าแรกแล้ว',
                url: info.url,
                filename: info.filename,
                bytes: info.bytes
            });
        });
    });

    const certUpload = multer({
        storage: multer.diskStorage({
            destination: (_req, _file, cb) => {
                ensureCertDir();
                cb(null, CERT_DIR);
            },
            filename: (req, file, cb) => {
                const slotKey = String(req.query.slot || req.body?.slot || '').trim().toLowerCase();
                const slot = CERT_SLOTS[slotKey];
                if (!slot) return cb(new Error('slot ต้องเป็น logo หรือ stamp'));
                const dest = path.join(CERT_DIR, slot.filename);
                try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch (_) { /* ignore */ }
                cb(null, slot.filename);
            }
        }),
        limits: { fileSize: 5 * 1024 * 1024 },
        fileFilter: (_req, file, cb) => {
            if (HERO_MIME.has(String(file.mimetype || '').toLowerCase())) cb(null, true);
            else cb(new Error('รองรับเฉพาะไฟล์รูป JPG, PNG, WEBP หรือ GIF'));
        }
    });

    router.get('/cert-assets', (req, res) => {
        if (!requireAdmin(req, res)) return;
        res.json({ success: true, data: listCertAssets() });
    });

    router.post('/cert-assets/upload', (req, res) => {
        if (!requireAdmin(req, res)) return;
        certUpload.single('image')(req, res, (err) => {
            if (err) {
                return res.status(400).json({ success: false, message: err.message || 'อัปโหลดไม่สำเร็จ' });
            }
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'กรุณาเลือกไฟล์รูป' });
            }
            const slotKey = String(req.query.slot || req.body.slot || '').trim().toLowerCase();
            const items = listCertAssets();
            const item = items.find((x) => x.slot === slotKey) || items.find((x) => x.filename === req.file.filename);
            res.json({
                success: true,
                message: `อัปโหลด${item?.label || ''}แล้ว`,
                url: item?.url || `/uploads/cert/${req.file.filename}`,
                data: items
            });
        });
    });

    // สถานะการส่งอีเมล OTP
    router.get('/mail', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const secrets = readSecretsFile();
        const local = readLocalMail();
        res.json({
            success: true,
            status: getMailStatus(),
            form: {
                mode: secrets.mode || local.mode || 'smtp',
                smtpHost: secrets.smtpHost || local.smtpHost || 'smtp.gmail.com',
                smtpPort: secrets.smtpPort || local.smtpPort || 587,
                smtpSecure: !!(secrets.smtpSecure || local.smtpSecure),
                smtpUser: secrets.smtpUser || local.smtpUser || '',
                fromName: secrets.fromName || local.fromName || 'PTS Learning',
                fromEmail: secrets.fromEmail || local.fromEmail || '',
                hasSmtpPass: !!(secrets.smtpPass || local.smtpPass),
                hasBrevoKey: !!(secrets.brevoApiKey || local.brevoApiKey)
            }
        });
    });

    // บันทึกค่าส่งอีเมลจริง (เก็บใน backend/mail.secrets.json)
    router.put('/mail', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const body = req.body || {};
            writeSecretsFile({
                mode: body.mode || 'auto',
                smtpHost: body.smtpHost,
                smtpPort: body.smtpPort,
                smtpSecure: body.smtpSecure,
                smtpUser: body.smtpUser,
                smtpPass: body.smtpPass, // ว่าง = คงรหัสเดิม
                brevoApiKey: body.brevoApiKey,
                fromName: body.fromName,
                fromEmail: body.fromEmail
            });
            res.json({
                success: true,
                message: 'บันทึกการตั้งค่าอีเมลแล้ว — OTP จะส่งเข้าอีเมลจริง',
                status: publicMailStatus()
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // ทดสอบส่ง OTP ไปอีเมลที่ระบุ
    router.post('/mail/test', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุอีเมลทดสอบ' });
        }
        try {
            const issued = await issueEmailOtp(email, 'reset');
            res.json({
                success: true,
                message: `ส่ง OTP ทดสอบไปที่ ${issued.masked} แล้ว (ผ่าน ${issued.mode})`,
                mode: issued.mode,
                masked_email: issued.masked
            });
        } catch (error) {
            console.error('❌ mail test:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = { createAdminRouter };
