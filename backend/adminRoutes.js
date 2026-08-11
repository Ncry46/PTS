const { flagActiveSql, isFlagActive, normalizeFlagYn, bindFlagInput, flagSqlLiteral, setFlagUse } = require('./db');
const express = require('express');
const sql = require('mssql');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { writeSecretsFile, readSecretsFile, readLocalMail, publicMailStatus } = require('./mailSecrets');
const { issueEmailOtp, getMailStatus, sendCouponEmail } = require('./emailOtp');
const { syncScheduleToEnrolledUsers, removeScheduleFromAllCalendars } = require('./googleCalendar');
const { HERO_DIR, ensureHeroDir, mapHeroSlidesImages, HOME_BANNER_FILENAME, getHomeBannerInfo, homeBannerPath, listGalleryBanners, deleteGalleryBanner, isGalleryBannerFilename, reorderGalleryBanners, appendBannerToOrder } = require('./heroImages');
const {
    CERT_DIR,
    CERT_SLOTS,
    ensureCertDir,
    listCertAssets
} = require('./certAssets');
const { markPaidAndEnroll } = require('./paymentActions');
const {
    USAGE_RULES,
    normalizeCouponCode,
    parseDiscountAmount
} = require('./couponHelpers');
const {
    COURSE_API_VERSION,
    isMissingBilingualColumnError,
    localizeCourseRows,
    courseListTextSql,
    courseMetaSelectSql,
    normalizeCourseBody,
    resolveLangFromReq
} = require('./courseLang');

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
    const isVisible = !(body.flag_use === false || body.flag_use === 0 || body.flag_use === '0' || body.flag_use === 'N');
    return {
        sort_order: Math.max(1, parseInt(body.sort_order, 10) || 1),
        flag_use: isVisible ? 'Y' : 'N',
        eyebrow: String(body.eyebrow || '').trim() || null,
        section_title: String(body.section_title || body.title || '').trim(),
        section_title_highlight: String(body.section_title_highlight || body.title_highlight || '').trim() || null,
        lead: String(body.lead || '').trim() || null,
        cta_primary_label: String(body.cta_primary_label || '').trim() || null,
        cta_primary_href: String(body.cta_primary_href || '').trim() || null,
        cta_secondary_label: String(body.cta_secondary_label || '').trim() || null,
        cta_secondary_href: String(body.cta_secondary_href || '').trim() || null,
        image_url: String(body.image_url || '').trim() || null,
        image_alt: String(body.image_alt || '').trim() || null,
        badge_icon: HERO_ICONS.has(icon) ? icon : 'check_circle',
        badge_section_title: String(body.badge_section_title || body.badge_title || '').trim() || null,
        badge_subsection_title: String(body.badge_subsection_title || body.badge_subtitle || '').trim() || null,
        theme,
        theme_color: theme === 'custom' ? themeColor : (themeColor || null)
    };
}

async function bindHeroInputs(pool, request, data) {
    request
        .input('sort_order', sql.Int, data.sort_order)
        .input('eyebrow', sql.NVarChar(255), data.eyebrow)
        .input('section_title', sql.NVarChar(255), data.section_title)
        .input('section_title_highlight', sql.NVarChar(255), data.section_title_highlight)
        .input('lead', sql.NVarChar(sql.MAX), data.lead)
        .input('cta_primary_label', sql.NVarChar(255), data.cta_primary_label)
        .input('cta_primary_href', sql.NVarChar(500), data.cta_primary_href)
        .input('cta_secondary_label', sql.NVarChar(255), data.cta_secondary_label)
        .input('cta_secondary_href', sql.NVarChar(500), data.cta_secondary_href)
        .input('image_url', sql.NVarChar(500), data.image_url)
        .input('image_alt', sql.NVarChar(255), data.image_alt)
        .input('badge_icon', sql.NVarChar(50), data.badge_icon)
        .input('badge_section_title', sql.NVarChar(255), data.badge_section_title)
        .input('badge_subsection_title', sql.NVarChar(255), data.badge_subsection_title)
        .input('theme', sql.NVarChar(50), data.theme)
        .input('theme_color', sql.NVarChar(20), data.theme_color);
    await bindFlagInput(pool, request, 'flag_use', 'hero_slides', isFlagActive(data.flag_use));
    return request;
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
                    (SELECT COUNT(*) FROM dbo.users) AS users_count,
                    (SELECT COUNT(*) FROM dbo.courses) AS courses_count,
                    (SELECT COUNT(*) FROM dbo.course_enrollments) AS enrollments_count,
                    (SELECT COUNT(*) FROM dbo.community_posts WHERE ${flagActiveSql('flag_use')}) AS posts_count,
                    (SELECT COUNT(*) FROM dbo.payments WHERE status = 'paid') AS paid_count,
                    (SELECT ISNULL(SUM(amount), 0) FROM dbo.payments WHERE status = 'paid') AS revenue
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
                SELECT TOP 200 user_id, email, username, phone, Role, FlagUse, Url
                FROM dbo.users
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

        // แปลงค่า flag_use ป้องกันกรณี Frontend ส่งมาเป็น Boolean / Number / String
        let normalizedFlagUse = null;
        if (flag_use !== undefined && flag_use !== null) {
            normalizedFlagUse = (flag_use === 'Y' || flag_use === '1' || flag_use === 1 || flag_use === true) ? 'Y' : 'N';
        }

        try {
            const pool = await poolPromise;
            await pool.request()
                .input('userId', sql.Int, userId)
                .input('role', sql.VarChar(50), role ? String(role) : null)
                .input('flagUse', sql.VarChar(1), normalizedFlagUse)
                .query(`
                    UPDATE dbo.users
                    SET
                        Role = COALESCE(@role, Role),
                        FlagUse = COALESCE(@flagUse, FlagUse)
                    WHERE user_id = @userId
                `);
            res.json({ success: true, message: 'อัปเดตผู้ใช้แล้ว' });
        } catch (error) {
            console.error('❌ อัปเดตผู้ใช้ล้มเหลว:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/courses', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const lang = resolveLangFromReq(req);
            const result = await pool.request().query(`
                SELECT
                    ${courseMetaSelectSql('')},
                    ${courseListTextSql('', lang)}
                FROM dbo.courses
                WHERE ${flagActiveSql('flag_use')}
                ORDER BY created_at DESC
            `);
            res.json({
                success: true,
                apiVersion: COURSE_API_VERSION,
                lang,
                data: localizeCourseRows(result.recordset || [], lang)
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/courses', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const body = req.body || {};
        const text = normalizeCourseBody(body);
        const {
            delivery_mode, total_hours, cover_image_url, is_featured,
            coursesFlag, price, coursescat_id,
            total_enrolled, start_date, is_open_soon
        } = body;

        if (!text.course_name_th) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุชื่อหลักสูตร (ไทย)' });
        }

        try {
            const pool = await poolPromise;
            const insertReq = pool.request()
                .input('name', sql.NVarChar(255), text.course_name_th)
                .input('nameEn', sql.NVarChar(255), text.course_name_en)
                .input('instructor', sql.NVarChar(255), text.instructor_name_th || 'PTS Instructor')
                .input('instructorEn', sql.NVarChar(255), text.instructor_name_en)
                .input('mode', sql.VarChar(20), delivery_mode || 'online')
                .input('hours', sql.Decimal(10, 2), Number(total_hours || 1))
                .input('cover', sql.NVarChar(500), cover_image_url || null)
                .input('featured', sql.Bit, is_featured ? 1 : 0)
                .input('coursesFlag', sql.NVarChar(50), coursesFlag != null && coursesFlag !== '' ? String(coursesFlag) : 'Y')
                .input('price', sql.Decimal(10, 2), price != null && price !== '' ? Number(price) : null)
                .input('description', sql.NVarChar(sql.MAX), text.description_th)
                .input('descriptionEn', sql.NVarChar(sql.MAX), text.description_en)
                .input('catId', sql.Int, coursescat_id != null && coursescat_id !== '' ? Number(coursescat_id) : null)
                .input('enrolled', sql.Int, total_enrolled != null && total_enrolled !== '' ? Number(total_enrolled) : 0)
                .input('startDate', sql.Date, start_date || null)
                .input('openSoon', sql.Bit, is_open_soon ? 1 : 0);
            await bindFlagInput(pool, insertReq, 'flagUse', 'courses', true);

            const bilingualInsert = `
                    INSERT INTO dbo.courses
                    (course_name_th, course_name_en,
                     instructor_name_th, instructor_name_en,
                     delivery_mode, total_hours,
                     average_rating, total_reviews, cover_image_url, is_featured,
                     coursesFlag, created_at, price, description_th, description_en, flag_use,
                     coursescat_id, total_enrolled, start_date, is_open_soon)
                    OUTPUT INSERTED.course_id, INSERTED.course_name_th AS course_name
                    VALUES (
                        @name, @nameEn,
                        @instructor, @instructorEn,
                        @mode, @hours,
                        0, 0, @cover, @featured,
                        @coursesFlag, GETDATE(), @price, @description, @descriptionEn, @flagUse,
                        @catId, @enrolled, @startDate, @openSoon
                    )
                `;
            const legacyInsert = `
                    INSERT INTO dbo.courses
                    (course_name, instructor_name, delivery_mode, total_hours,
                     average_rating, total_reviews, cover_image_url, is_featured,
                     coursesFlag, created_at, price, description, flag_use,
                     coursescat_id, total_enrolled, start_date, is_open_soon)
                    OUTPUT INSERTED.course_id, INSERTED.course_name
                    VALUES (
                        @name, @instructor, @mode, @hours,
                        0, 0, @cover, @featured,
                        @coursesFlag, GETDATE(), @price, @description, @flagUse,
                        @catId, @enrolled, @startDate, @openSoon
                    )
                `;

            let result;
            try {
                result = await insertReq.query(bilingualInsert);
            } catch (insErr) {
                if (!isMissingBilingualColumnError(insErr)) throw insErr;
                result = await insertReq.query(legacyInsert);
            }

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
        const text = normalizeCourseBody(body);
        const hasName = body.course_name != null || body.course_name_th != null || body.course_name_en != null;
        const hasInstructor = body.instructor_name != null || body.instructor_name_th != null || body.instructor_name_en != null;
        const hasDesc = body.description !== undefined || body.description_th !== undefined || body.description_en !== undefined;

        try {
            const pool = await poolPromise;
            await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('name', sql.NVarChar(255), text.course_name_th)
                .input('nameEn', sql.NVarChar(255), text.course_name_en)
                .input('hasName', sql.Bit, hasName ? 1 : 0)
                .input('instructor', sql.NVarChar(255), text.instructor_name_th)
                .input('instructorEn', sql.NVarChar(255), text.instructor_name_en)
                .input('hasInstructor', sql.Bit, hasInstructor ? 1 : 0)
                .input('mode', sql.VarChar(20), body.delivery_mode != null ? String(body.delivery_mode) : null)
                .input('hours', sql.Decimal(10, 2), body.total_hours != null && body.total_hours !== '' ? Number(body.total_hours) : null)
                .input('cover', sql.NVarChar(500), body.cover_image_url !== undefined ? (body.cover_image_url || null) : null)
                .input('hasCover', sql.Bit, body.cover_image_url !== undefined ? 1 : 0)
                .input('featured', sql.Bit, typeof body.is_featured === 'boolean' ? (body.is_featured ? 1 : 0) : null)
                .input('coursesFlag', sql.NVarChar(50), body.coursesFlag !== undefined ? (body.coursesFlag || null) : null)
                .input('hasFlag', sql.Bit, body.coursesFlag !== undefined ? 1 : 0)
                .input('price', sql.Decimal(10, 2), body.price !== undefined && body.price !== '' && body.price != null ? Number(body.price) : null)
                .input('hasPrice', sql.Bit, body.price !== undefined ? 1 : 0)
                .input('description', sql.NVarChar(sql.MAX), text.description_th)
                .input('descriptionEn', sql.NVarChar(sql.MAX), text.description_en)
                .input('hasDesc', sql.Bit, hasDesc ? 1 : 0)
                .input('catId', sql.Int, body.coursescat_id !== undefined && body.coursescat_id !== '' && body.coursescat_id != null ? Number(body.coursescat_id) : null)
                .input('hasCat', sql.Bit, body.coursescat_id !== undefined ? 1 : 0)
                .input('enrolled', sql.Int, body.total_enrolled !== undefined && body.total_enrolled !== '' ? Number(body.total_enrolled) : null)
                .input('startDate', sql.Date, body.start_date !== undefined ? (body.start_date || null) : null)
                .input('hasStart', sql.Bit, body.start_date !== undefined ? 1 : 0)
                .input('openSoon', sql.Bit, typeof body.is_open_soon === 'boolean' ? (body.is_open_soon ? 1 : 0) : null)
                .query(`
                    UPDATE dbo.courses
                    SET
                        course_name_th = CASE WHEN @hasName = 1 THEN COALESCE(@name, course_name_th) ELSE course_name_th END,
                        course_name_en = CASE WHEN @hasName = 1 THEN @nameEn ELSE course_name_en END,
                        instructor_name_th = CASE WHEN @hasInstructor = 1 THEN COALESCE(@instructor, instructor_name_th) ELSE instructor_name_th END,
                        instructor_name_en = CASE WHEN @hasInstructor = 1 THEN @instructorEn ELSE instructor_name_en END,
                        delivery_mode = COALESCE(@mode, delivery_mode),
                        total_hours = COALESCE(@hours, total_hours),
                        cover_image_url = CASE WHEN @hasCover = 1 THEN @cover ELSE cover_image_url END,
                        is_featured = COALESCE(@featured, is_featured),
                        coursesFlag = CASE WHEN @hasFlag = 1 THEN @coursesFlag ELSE coursesFlag END,
                        price = CASE WHEN @hasPrice = 1 THEN @price ELSE price END,
                        description_th = CASE WHEN @hasDesc = 1 THEN @description ELSE description_th END,
                        description_en = CASE WHEN @hasDesc = 1 THEN @descriptionEn ELSE description_en END,
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
            const result = await setFlagUse(pool, {
                table: 'courses',
                idColumn: 'course_id',
                idValue: courseId,
                active: false
            });
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
        const {
            section_title: rawSection,
            lesson_title: rawLesson,
            title: rawTitle,
            content_html,
            video_url,
            file_url,
            duration_minutes,
            sort_order,
            flag_use
        } = req.body;

        const section_title = String(rawSection || rawTitle || '').trim();
        const lesson_title = String(rawLesson || section_title || '').trim();

        if (!courseId || (!section_title && !lesson_title)) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุหลักสูตรและชื่อบทเรียน' });
        }

        const flagActive = flag_use !== undefined && flag_use !== null
            ? isFlagActive(flag_use)
            : true;

        try {
            const pool = await poolPromise;
            const insertReq = pool.request()
                .input('courseId', sql.Int, courseId)
                .input('section_title', sql.NVarChar(255), section_title || 'บทเรียนทั่วไป')
                .input('lesson_title', sql.NVarChar(255), lesson_title || section_title)
                .input('content', sql.NVarChar(sql.MAX), content_html || '')
                .input('video', sql.NVarChar(500), video_url || null)
                .input('fileUrl', sql.NVarChar(500), file_url || null)
                .input('duration', sql.Int, Number(duration_minutes) || 15)
                .input('sort', sql.Int, Number(sort_order) || 1);
            await bindFlagInput(pool, insertReq, 'flagUse', 'course_lessons', flagActive);
            const result = await insertReq.query(`
                    INSERT INTO dbo.course_lessons
                    (
                        course_id, 
                        section_title, 
                        lesson_title, 
                        content_html, 
                        video_url, 
                        file_url,
                        duration_minutes, 
                        sort_order, 
                        flag_use
                    )
                    OUTPUT INSERTED.lesson_id, INSERTED.section_title, INSERTED.lesson_title
                    VALUES 
                    (
                        @courseId, 
                        @section_title, 
                        @lesson_title, 
                        @content, 
                        @video, 
                        @fileUrl,
                        @duration, 
                        @sort, 
                        @flagUse
                    )
                `);

            res.json({ 
                success: true, 
                message: 'เพิ่มบทเรียนเรียบร้อยแล้ว', 
                data: result.recordset[0] 
            });

        } catch (error) {
            console.error('❌ เพิ่มบทเรียนล้มเหลว:', error.message);
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
                    SELECT lesson_id, course_id, section_title, lesson_title,
                           COALESCE(NULLIF(LTRIM(RTRIM(CAST(lesson_title AS NVARCHAR(255)))), N''), section_title) AS title,
                           content_html, video_url, file_url, duration_minutes, sort_order, flag_use
                    FROM dbo.course_lessons
                    WHERE course_id = @courseId
                      AND ${flagActiveSql('flag_use')}
                    ORDER BY ISNULL(sort_order, 999) ASC, lesson_id ASC
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

        const {
            section_title: rawSection,
            lesson_title: rawLesson,
            title: rawTitle,
            content_html,
            video_url,
            file_url,
            flag_use,
            sort_order,
            duration_minutes
        } = req.body;
        const section_title = rawSection != null ? rawSection : rawTitle;
        const lesson_title = rawLesson != null ? rawLesson : (rawTitle != null ? rawTitle : null);

        let flagActive = null;
        if (flag_use !== undefined && flag_use !== null) {
            flagActive = isFlagActive(flag_use);
        }

        try {
            const pool = await poolPromise;
            const upd = pool.request()
                .input('lessonId', sql.Int, lessonId)
                .input('section_title', sql.NVarChar(255), section_title != null && section_title !== '' ? String(section_title) : null)
                .input('lesson_title', sql.NVarChar(255), lesson_title != null && lesson_title !== '' ? String(lesson_title) : null)
                .input('content', sql.NVarChar(sql.MAX), content_html != null ? String(content_html) : null)
                .input('video', sql.NVarChar(500), video_url != null ? String(video_url) : null)
                .input('fileUrl', sql.NVarChar(500), file_url != null ? String(file_url) : null)
                .input('sort', sql.Int, sort_order != null && sort_order !== '' ? Number(sort_order) : null)
                .input('duration', sql.Int, duration_minutes != null && duration_minutes !== '' ? Number(duration_minutes) : null);

            let flagSet = '';
            if (flagActive != null) {
                await bindFlagInput(pool, upd, 'flagUse', 'course_lessons', flagActive);
                flagSet = 'flag_use = @flagUse,';
            }

            const result = await upd.query(`
                    UPDATE dbo.course_lessons
                    SET
                        section_title = COALESCE(@section_title, section_title),
                        lesson_title = COALESCE(@lesson_title, lesson_title),
                        content_html = COALESCE(@content, content_html),
                        video_url = COALESCE(@video, video_url),
                        file_url = COALESCE(@fileUrl, file_url),
                        ${flagSet}
                        sort_order = COALESCE(@sort, sort_order),
                        duration_minutes = COALESCE(@duration, duration_minutes)
                    WHERE lesson_id = @lessonId
                `);

            if (!result.rowsAffected?.[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบบทเรียน หรือถูกลบไปแล้ว' });
            }

            res.json({ success: true, message: 'อัปเดตบทเรียนแล้ว' });
        } catch (error) {
            console.error('❌ อัปเดตบทเรียนล้มเหลว:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.delete('/lessons/:lessonId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const lessonId = parseInt(req.params.lessonId, 10);
        try {
            const pool = await poolPromise;
            await setFlagUse(pool, {
                table: 'course_lessons',
                idColumn: 'lesson_id',
                idValue: lessonId,
                active: false
            });
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
                SELECT s.*, 
                    c.course_name_th, 
                    c.course_name_en,
                    COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name
                FROM dbo.class_schedules s
                LEFT JOIN dbo.courses c ON c.course_id = s.course_id
                WHERE ${flagActiveSql('s.flag_use')}
                ORDER BY s.start_at DESC
            `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/schedules', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const { section_title, course_id, start_at, end_at, location, meeting_url, delivery_mode } = req.body;
        if (!section_title || !start_at || !end_at) {
            return res.status(400).json({ success: false, message: 'กรุณากรอกหัวข้อและเวลา' });
        }
        if (!course_id) {
            return res.status(400).json({ success: false, message: 'กรุณาเลือกหลักสูตรที่ผูกตาราง (จำเป็นสำหรับซิงค์ปฏิทินนักเรียน)' });
        }

        try {
            const pool = await poolPromise;
            const insertReq = pool.request()
                .input('section_title', sql.NVarChar(255), section_title)
                .input('courseId', sql.Int, Number(course_id))
                .input('startAt', sql.DateTime, new Date(start_at))
                .input('endAt', sql.DateTime, new Date(end_at))
                .input('location', sql.NVarChar(255), location || null)
                .input('meeting', sql.NVarChar(500), meeting_url || null)
                .input('mode', sql.VarChar(20), delivery_mode || 'online');
            await bindFlagInput(pool, insertReq, 'flagUse', 'class_schedules', true);
            const result = await insertReq.query(`
                    INSERT INTO dbo.class_schedules
                    (course_id, section_title, start_at, end_at, location, meeting_url, delivery_mode, flag_use)
                    OUTPUT INSERTED.schedule_id
                    VALUES (@courseId, @section_title, @startAt, @endAt, @location, @meeting, @mode, @flagUse)
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
            await setFlagUse(pool, {
                table: 'class_schedules',
                idColumn: 'schedule_id',
                idValue: scheduleId,
                active: false
            });
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
                    u.username AS author_name, u.email
                FROM dbo.community_posts p
                INNER JOIN dbo.users u ON u.user_id = p.user_id
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
            await setFlagUse(pool, {
                table: 'community_posts',
                idColumn: 'post_id',
                idValue: postId,
                active: false
            });
            res.json({ success: true, message: 'ซ่อนโพสต์แล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.patch('/posts/:postId', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const postId = parseInt(req.params.postId, 10);
        if (!postId) return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });

        const visible = isFlagActive(req.body.flag_use === undefined ? true : req.body.flag_use);
        try {
            const pool = await poolPromise;
            const result = await setFlagUse(pool, {
                table: 'community_posts',
                idColumn: 'post_id',
                idValue: postId,
                active: visible
            });
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
                request.input('source', sql.VarChar(50), sourceFilter);
                where += ' AND ISNULL(p.source, \'direct_signup\') = @source';
            }
            const result = await request.query(`
                SELECT TOP 300
                    p.payment_id, p.user_id, p.course_id, p.amount, p.status, p.method,
                    ISNULL(p.source, 'direct_signup') AS source,
                    p.reference_code, p.paid_at, p.created_at,
                    p.slip_image_url, p.transfer_at, p.reviewed_by, p.reviewed_at, p.reject_reason,
                    p.access_code_id,
                    u.username, u.email,
                    c.course_name_th, c.course_name_en,
                    COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name,
                    reviewer.username AS reviewer_name,
                    ac.code AS access_code
                FROM dbo.payments p
                INNER JOIN dbo.users u ON u.user_id = p.user_id
                INNER JOIN dbo.courses c ON c.course_id = p.course_id
                LEFT JOIN dbo.users reviewer ON reviewer.user_id = p.reviewed_by
                LEFT JOIN dbo.access_codes ac ON ac.access_code_id = p.access_code_id
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
                    FROM dbo.payments
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
                    FROM dbo.payments
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
                .input('reason', sql.NVarChar(500), reason.slice(0, 500))
                .input('reviewedBy', sql.Int, admin.user_id)
                .query(`
                    UPDATE dbo.payments
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
                    c.course_name_th, c.course_name_en,
                    COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name, u.username AS created_by_name
                FROM dbo.access_codes a
                INNER JOIN dbo.courses c ON c.course_id = a.course_id
                LEFT JOIN dbo.users u ON u.user_id = a.created_by
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
                .query(`SELECT course_id,
                       course_name_th, course_name_en,
                       COALESCE(NULLIF(LTRIM(RTRIM(course_name_th)), N''), NULLIF(LTRIM(RTRIM(course_name_en)), N'')) AS course_name
                FROM dbo.courses WHERE course_id = @courseId`);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }

            const insertReq = pool.request()
                .input('code', sql.VarChar(50), code)
                .input('courseId', sql.Int, courseId)
                .input('maxUses', sql.Int, maxUses)
                .input('expiresAt', sql.DateTime, expiresAt)
                .input('note', sql.NVarChar(255), note)
                .input('createdBy', sql.Int, admin.user_id);
            await bindFlagInput(pool, insertReq, 'flagUse', 'access_codes', true);
            const inserted = await insertReq.query(`
                    INSERT INTO dbo.access_codes
                    (code, course_id, max_uses, used_count, expires_at, note, flag_use, created_by)
                    OUTPUT INSERTED.access_code_id, INSERTED.code, INSERTED.course_id, INSERTED.max_uses,
                           INSERTED.used_count, INSERTED.expires_at, INSERTED.note, INSERTED.flag_use, INSERTED.created_at
                    VALUES (@code, @courseId, @maxUses, 0, @expiresAt, @note, @flagUse, @createdBy)
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
        
        const rawFlag = req.body.flag_use;

        if (rawFlag === undefined || rawFlag === null) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ flag_use' });
        }

        const isEnable = isFlagActive(rawFlag);
        try {
            const pool = await poolPromise;
            const result = await setFlagUse(pool, {
                table: 'access_codes',
                idColumn: 'access_code_id',
                idValue: id,
                active: isEnable
            });

            if (!result.rowsAffected?.[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบรหัส' });
            }

            res.json({ 
                success: true, 
                message: isEnable ? 'เปิดใช้รหัสแล้ว' : 'ปิดใช้รหัสแล้ว' 
            });
        } catch (error) {
            console.error('❌ อัปเดต access-code ล้มเหลว:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // —— Coupons (discount codes) ——
    router.get('/coupons', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT TOP 200
                    cp.coupon_id, cp.code, cp.course_id, cp.discount_amount, cp.usage_rule,
                    cp.max_uses, cp.used_count, cp.expires_at, cp.note, cp.flag_use,
                    cp.created_at, cp.created_by,
                    ISNULL(c.price, 0) AS course_price,
                    COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name,
                    u.username AS created_by_name
                FROM dbo.coupons cp
                INNER JOIN dbo.courses c ON c.course_id = cp.course_id
                LEFT JOIN dbo.users u ON u.user_id = cp.created_by
                ORDER BY cp.created_at DESC
            `);
            res.json({ success: true, data: result.recordset });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/coupons', async (req, res) => {
        const admin = requireAdmin(req, res);
        if (!admin) return;

        const courseId = parseInt(req.body.course_id, 10);
        let code = normalizeCouponCode(req.body.code);
        const note = String(req.body.note || '').trim().slice(0, 255) || null;
        const usageRule = String(req.body.usage_rule || 'max_uses').trim().toLowerCase();
        const discount = parseDiscountAmount(req.body.discount_amount);
        const maxUsesRaw = req.body.max_uses;
        const maxUses = maxUsesRaw === '' || maxUsesRaw == null ? null : parseInt(maxUsesRaw, 10);
        const expiresRaw = String(req.body.expires_at || '').trim();

        if (!courseId) return res.status(400).json({ success: false, message: 'เลือกหลักสูตรก่อน' });
        if (!USAGE_RULES.has(usageRule)) {
            return res.status(400).json({ success: false, message: 'กฎการใช้คูปองไม่ถูกต้อง' });
        }
        if (discount == null) {
            return res.status(400).json({ success: false, message: 'ส่วนลดต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป' });
        }
        if (!code) {
            code = `PA-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        }
        if (code.length < 4 || code.length > 64) {
            return res.status(400).json({ success: false, message: 'รหัสคูปองต้องยาว 4–64 ตัวอักษร' });
        }
        if (!/^[A-Z0-9._\-]+$/.test(code)) {
            return res.status(400).json({ success: false, message: 'รหัสใช้ได้เฉพาะตัวอักษร ตัวเลข . _ -' });
        }

        let resolvedMaxUses = maxUses;
        if (usageRule === 'once') {
            resolvedMaxUses = 1;
        } else if (usageRule === 'max_uses') {
            if (resolvedMaxUses == null || Number.isNaN(resolvedMaxUses) || resolvedMaxUses < 1) {
                return res.status(400).json({ success: false, message: 'กรุณาระบุจำนวนครั้งใช้ได้ (อย่างน้อย 1)' });
            }
        } else if (usageRule === 'once_per_user') {
            if (resolvedMaxUses != null && (Number.isNaN(resolvedMaxUses) || resolvedMaxUses < 1)) {
                return res.status(400).json({ success: false, message: 'จำนวนครั้งรวมไม่ถูกต้อง' });
            }
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
                .query(`
                    SELECT course_id, ISNULL(price, 0) AS price,
                           COALESCE(NULLIF(LTRIM(RTRIM(course_name_th)), N''), NULLIF(LTRIM(RTRIM(course_name_en)), N'')) AS course_name
                    FROM dbo.courses WHERE course_id = @courseId
                `);
            if (!course.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }
            const coursePrice = Number(course.recordset[0].price) || 0;
            if (discount > coursePrice) {
                return res.status(400).json({
                    success: false,
                    message: `ส่วนลดต้องไม่เกินราคาคอร์ส (฿${coursePrice.toLocaleString('th-TH')})`
                });
            }

            const insertReq = pool.request()
                .input('code', sql.VarChar(64), code)
                .input('courseId', sql.Int, courseId)
                .input('discount', sql.Decimal(10, 2), discount)
                .input('usageRule', sql.VarChar(20), usageRule)
                .input('maxUses', sql.Int, resolvedMaxUses)
                .input('expiresAt', sql.DateTime, expiresAt)
                .input('note', sql.NVarChar(255), note)
                .input('createdBy', sql.Int, admin.user_id);
            await bindFlagInput(pool, insertReq, 'flagUse', 'coupons', true);
            const inserted = await insertReq.query(`
                INSERT INTO dbo.coupons
                (code, course_id, discount_amount, usage_rule, max_uses, used_count, expires_at, note, flag_use, created_by)
                OUTPUT INSERTED.coupon_id, INSERTED.code, INSERTED.course_id, INSERTED.discount_amount,
                       INSERTED.usage_rule, INSERTED.max_uses, INSERTED.used_count, INSERTED.expires_at,
                       INSERTED.note, INSERTED.flag_use, INSERTED.created_at
                VALUES (@code, @courseId, @discount, @usageRule, @maxUses, 0, @expiresAt, @note, @flagUse, @createdBy)
            `);

            res.json({
                success: true,
                message: 'สร้างคูปองแล้ว',
                data: {
                    ...inserted.recordset[0],
                    course_name: course.recordset[0].course_name,
                    course_price: coursePrice
                }
            });
        } catch (error) {
            if (String(error.message || '').includes('UQ_coupons_code') || String(error.number) === '2627') {
                return res.status(409).json({ success: false, message: 'รหัสคูปองนี้มีอยู่แล้ว' });
            }
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.patch('/coupons/:id', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ success: false, message: 'รหัสไม่ถูกต้อง' });

        const rawFlag = req.body.flag_use;
        if (rawFlag === undefined || rawFlag === null) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุ flag_use' });
        }

        const isEnable = isFlagActive(rawFlag);
        try {
            const pool = await poolPromise;
            const result = await setFlagUse(pool, {
                table: 'coupons',
                idColumn: 'coupon_id',
                idValue: id,
                active: isEnable
            });
            if (!result.rowsAffected?.[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบคูปอง' });
            }
            res.json({
                success: true,
                message: isEnable ? 'เปิดใช้คูปองแล้ว' : 'ปิดใช้คูปองแล้ว'
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/coupons/:id/send-email', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const id = parseInt(req.params.id, 10);
        if (!id) return res.status(400).json({ success: false, message: 'รหัสคูปองไม่ถูกต้อง' });

        const userId = req.body.user_id != null && req.body.user_id !== ''
            ? parseInt(req.body.user_id, 10)
            : null;
        let email = String(req.body.email || '').trim().toLowerCase();
        let fullName = String(req.body.full_name || '').trim();

        try {
            const pool = await poolPromise;
            const couponRes = await pool.request()
                .input('id', sql.Int, id)
                .query(`
                    SELECT
                        cp.coupon_id, cp.code, cp.discount_amount, cp.flag_use,
                        ISNULL(c.price, 0) AS course_price,
                        COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N'')) AS course_name
                    FROM dbo.coupons cp
                    INNER JOIN dbo.courses c ON c.course_id = cp.course_id
                    WHERE cp.coupon_id = @id
                `);
            if (!couponRes.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบคูปอง' });
            }
            const coupon = couponRes.recordset[0];
            if (!coupon.flag_use) {
                return res.status(400).json({ success: false, message: 'คูปองถูกปิดใช้งานแล้ว' });
            }

            if (userId) {
                const userRes = await pool.request()
                    .input('userId', sql.Int, userId)
                    .query(`SELECT user_id, email, username FROM dbo.users WHERE user_id = @userId`);
                if (!userRes.recordset.length) {
                    return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้' });
                }
                email = String(userRes.recordset[0].email || '').trim().toLowerCase();
                if (!fullName) fullName = String(userRes.recordset[0].username || '').trim();
            }

            if (!email || !email.includes('@')) {
                return res.status(400).json({ success: false, message: 'กรุณาระบุอีเมลหรือเลือกผู้ใช้ในระบบ' });
            }

            const coursePrice = Number(coupon.course_price) || 0;
            const discount = Math.min(Number(coupon.discount_amount) || 0, coursePrice);
            const finalAmount = Math.max(0, coursePrice - discount);
            const finalHint = finalAmount === 0
                ? 'ใช้แล้วเรียนฟรี (0 บาท)'
                : `ราคาหลังลดประมาณ ฿${finalAmount.toLocaleString('th-TH')}`;

            await sendCouponEmail(email, {
                fullName,
                courseName: coupon.course_name,
                code: coupon.code,
                discountAmount: discount,
                finalHint
            });

            res.json({
                success: true,
                message: `ส่งคูปองไปที่ ${email} แล้ว`
            });
        } catch (error) {
            const code = error && error.code;
            if (code === 'MAIL_NOT_CONFIGURED' || code === 'SMTP_MISSING' || code === 'BREVO_MISSING') {
                return res.status(503).json({
                    success: false,
                    message: 'ยังไม่ได้ตั้งค่าการส่งอีเมล — ไปที่แท็บอีเมล OTP เพื่อตั้งค่า'
                });
            }
            res.status(500).json({ success: false, message: error.message || 'ส่งอีเมลไม่สำเร็จ' });
        }
    });

    // —— Home hero slides ——
    router.get('/hero-slides', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        try {
            const pool = await poolPromise;
            const result = await pool.request().query(`
                SELECT
                    slide_id, sort_order, eyebrow, section_title, section_title_highlight, lead,
                    cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href,
                    image_url, image_alt, badge_icon, badge_section_title, badge_subsection_title, theme, theme_color,
                    flag_use, created_at, updated_at
                FROM dbo.hero_slides
                ORDER BY ISNULL(sort_order, 999) ASC, slide_id ASC
            `);
            res.json({ success: true, data: mapHeroSlidesImages(result.recordset) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/hero-slides', async (req, res) => {
        if (!requireAdmin(req, res)) return;
        const data = normalizeHeroBody(req.body);
        if (!data.section_title) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุหัวข้อแบนเนอร์' });
        }
        try {
            const pool = await poolPromise;
            const insertReq = pool.request();
            await bindHeroInputs(pool, insertReq, data);
            const result = await insertReq.query(`
                INSERT INTO dbo.hero_slides (
                    sort_order, flag_use, eyebrow, section_title, section_title_highlight, lead,
                    cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href,
                    image_url, image_alt, badge_icon, badge_section_title, badge_subsection_title, theme, theme_color
                )
                OUTPUT INSERTED.slide_id
                VALUES (
                    @sort_order, @flag_use, @eyebrow, @section_title, @section_title_highlight, @lead,
                    @cta_primary_label, @cta_primary_href, @cta_secondary_label, @cta_secondary_href,
                    @image_url, @image_alt, @badge_icon, @badge_section_title, @badge_subsection_title, @theme, @theme_color
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
        if (!data.section_title) {
            return res.status(400).json({ success: false, message: 'กรุณาระบุหัวข้อแบนเนอร์' });
        }
        try {
            const pool = await poolPromise;
            const updReq = pool.request().input('slideId', sql.Int, slideId);
            await bindHeroInputs(pool, updReq, data);
            const result = await updReq.query(`
                    UPDATE dbo.hero_slides
                    SET sort_order = @sort_order,
                        flag_use = @flag_use,
                        eyebrow = @eyebrow,
                        section_title = @section_title,
                        section_title_highlight = @section_title_highlight,
                        lead = @lead,
                        cta_primary_label = @cta_primary_label,
                        cta_primary_href = @cta_primary_href,
                        cta_secondary_label = @cta_secondary_label,
                        cta_secondary_href = @cta_secondary_href,
                        image_url = @image_url,
                        image_alt = @image_alt,
                        badge_icon = @badge_icon,
                        badge_section_title = @badge_section_title,
                        badge_subsection_title = @badge_subsection_title,
                        theme = @theme,
                        theme_color = @theme_color,
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
            await setFlagUse(pool, {
                table: 'hero_slides',
                idColumn: 'slide_id',
                idValue: slideId,
                active: false,
                extraSet: 'updated_at = GETDATE()'
            });
            res.json({ success: true, message: 'ซ่อนแบนเนอร์แล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

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
            inputs.push(['theme', sql.NVarChar(50), theme]);
        }
        if (req.body.theme_color != null || req.body.themeColor != null) {
            const raw = req.body.theme_color != null ? req.body.theme_color : req.body.themeColor;
            if (String(raw || '').trim() === '') {
                sets.push('theme_color = @theme_color');
                inputs.push(['theme_color', sql.NVarChar(20), null]);
            } else {
                const themeColor = normalizeHexColor(raw);
                if (!themeColor) {
                    return res.status(400).json({ success: false, message: 'รหัสสีไม่ถูกต้อง (ใช้เช่น #ca1156)' });
                }
                sets.push('theme_color = @theme_color');
                inputs.push(['theme_color', sql.NVarChar(20), themeColor]);
                if (req.body.theme == null) {
                    sets.push('theme = @theme');
                    inputs.push(['theme', sql.NVarChar(50), 'custom']);
                }
            }
        }
        if (req.body.flag_use != null) {
            sets.push('flag_use = @flag_use');
            // bound later with bindFlagInput after pool is ready
            inputs.push(['__flag_use_active__', null, isFlagActive(req.body.flag_use)]);
        }
        if (!sets.length) {
            return res.status(400).json({ success: false, message: 'ไม่มีข้อมูลที่จะอัปเดต' });
        }
        sets.push('updated_at = GETDATE()');

        try {
            const pool = await poolPromise;
            let request = pool.request().input('slideId', sql.Int, slideId);
            for (const [name, type, value] of inputs) {
                if (name === '__flag_use_active__') {
                    await bindFlagInput(pool, request, 'flag_use', 'hero_slides', value);
                } else {
                    request = request.input(name, type, value);
                }
            }
            const result = await request.query(`
                UPDATE dbo.hero_slides
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