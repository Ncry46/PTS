const sql = require('mssql');

async function ensureLearningSchema(pool) {
    const statements = [
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'course_enrollments')
         CREATE TABLE dbo.course_enrollments (
            enrollment_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            progress_percent INT NOT NULL CONSTRAINT DF_course_enrollments_progress DEFAULT (0),
            status VARCHAR(20) NOT NULL CONSTRAINT DF_course_enrollments_status DEFAULT ('in_progress'),
            enrolled_at DATETIME NOT NULL CONSTRAINT DF_course_enrollments_enrolled DEFAULT (GETDATE()),
            updated_at DATETIME NOT NULL CONSTRAINT DF_course_enrollments_updated DEFAULT (GETDATE()),
            CONSTRAINT UQ_course_enrollments_user_course UNIQUE (user_id, course_id)
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'course_lessons')
         CREATE TABLE dbo.course_lessons (
            lesson_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            course_id INT NOT NULL,
            title NVARCHAR(255) NOT NULL,
            content_html NVARCHAR(MAX) NULL,
            video_url NVARCHAR(500) NULL,
            sort_order INT NOT NULL CONSTRAINT DF_course_lessons_sort DEFAULT (1),
            duration_minutes INT NOT NULL CONSTRAINT DF_course_lessons_duration DEFAULT (15),
            flag_use BIT NOT NULL CONSTRAINT DF_course_lessons_flag DEFAULT (1),
            created_at DATETIME NOT NULL CONSTRAINT DF_course_lessons_created DEFAULT (GETDATE())
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'lesson_progress')
         CREATE TABLE dbo.lesson_progress (
            progress_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            lesson_id INT NOT NULL,
            completed BIT NOT NULL CONSTRAINT DF_lesson_progress_completed DEFAULT (0),
            completed_at DATETIME NULL,
            CONSTRAINT UQ_lesson_progress_user_lesson UNIQUE (user_id, lesson_id)
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'class_schedules')
         CREATE TABLE dbo.class_schedules (
            schedule_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            course_id INT NULL,
            title NVARCHAR(255) NOT NULL,
            start_at DATETIME NOT NULL,
            end_at DATETIME NOT NULL,
            location NVARCHAR(255) NULL,
            meeting_url NVARCHAR(500) NULL,
            delivery_mode VARCHAR(20) NOT NULL CONSTRAINT DF_class_schedules_mode DEFAULT ('online'),
            flag_use BIT NOT NULL CONSTRAINT DF_class_schedules_flag DEFAULT (1),
            created_at DATETIME NOT NULL CONSTRAINT DF_class_schedules_created DEFAULT (GETDATE())
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'certificates')
         CREATE TABLE dbo.certificates (
            certificate_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            certificate_code VARCHAR(64) NOT NULL,
            issued_at DATETIME NOT NULL CONSTRAINT DF_certificates_issued DEFAULT (GETDATE()),
            CONSTRAINT UQ_certificates_user_course UNIQUE (user_id, course_id),
            CONSTRAINT UQ_certificates_code UNIQUE (certificate_code)
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'payments')
         CREATE TABLE dbo.payments (
            payment_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            currency VARCHAR(8) NOT NULL CONSTRAINT DF_payments_currency DEFAULT ('THB'),
            status VARCHAR(20) NOT NULL CONSTRAINT DF_payments_status DEFAULT ('pending'),
            method VARCHAR(40) NOT NULL CONSTRAINT DF_payments_method DEFAULT ('promptpay'),
            reference_code VARCHAR(64) NULL,
            paid_at DATETIME NULL,
            created_at DATETIME NOT NULL CONSTRAINT DF_payments_created DEFAULT (GETDATE())
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'course_favorites')
         CREATE TABLE dbo.course_favorites (
            favorite_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            course_id INT NOT NULL,
            created_at DATETIME NOT NULL CONSTRAINT DF_course_favorites_created DEFAULT (GETDATE()),
            CONSTRAINT UQ_course_favorites_user_course UNIQUE (user_id, course_id)
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'notifications')
         CREATE TABLE dbo.notifications (
            notification_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            title NVARCHAR(255) NOT NULL,
            body NVARCHAR(1000) NULL,
            link_url NVARCHAR(500) NULL,
            is_read BIT NOT NULL CONSTRAINT DF_notifications_read DEFAULT (0),
            created_at DATETIME NOT NULL CONSTRAINT DF_notifications_created DEFAULT (GETDATE())
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'google_calendar_links')
         CREATE TABLE dbo.google_calendar_links (
            user_id INT NOT NULL PRIMARY KEY,
            google_email NVARCHAR(255) NULL,
            access_token NVARCHAR(MAX) NOT NULL,
            refresh_token NVARCHAR(MAX) NULL,
            token_expiry DATETIME NULL,
            calendar_id NVARCHAR(128) NOT NULL CONSTRAINT DF_gcal_calendar DEFAULT ('primary'),
            connected_at DATETIME NOT NULL CONSTRAINT DF_gcal_connected DEFAULT (GETDATE()),
            updated_at DATETIME NOT NULL CONSTRAINT DF_gcal_updated DEFAULT (GETDATE())
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'google_calendar_events')
         CREATE TABLE dbo.google_calendar_events (
            map_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            schedule_id INT NOT NULL,
            google_event_id NVARCHAR(255) NOT NULL,
            synced_at DATETIME NOT NULL CONSTRAINT DF_gcal_events_synced DEFAULT (GETDATE()),
            CONSTRAINT UQ_gcal_events_user_schedule UNIQUE (user_id, schedule_id)
         )`,
        `IF COL_LENGTH('dbo.google_calendar_links', 'reminders_enabled') IS NULL
         ALTER TABLE dbo.google_calendar_links ADD reminders_enabled BIT NOT NULL
            CONSTRAINT DF_gcal_reminders_enabled DEFAULT (1)`,
        `IF COL_LENGTH('dbo.courses_main', 'price') IS NULL
         ALTER TABLE dbo.courses_main ADD price DECIMAL(10,2) NULL`,
        `IF COL_LENGTH('dbo.courses_main', 'description') IS NULL
         ALTER TABLE dbo.courses_main ADD description NVARCHAR(MAX) NULL`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'attendance_logs')
         CREATE TABLE dbo.attendance_logs (
            log_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            employee_id NVARCHAR(255) NOT NULL,
            scan_timestamp DATETIME NOT NULL CONSTRAINT DF_attendance_scan_ts DEFAULT (GETDATE()),
            scan_type NVARCHAR(16) NOT NULL,
            kiosk_device_id NVARCHAR(100) NULL,
            status NVARCHAR(32) NOT NULL CONSTRAINT DF_attendance_status DEFAULT ('NORMAL'),
            created_at DATETIME NOT NULL CONSTRAINT DF_attendance_created DEFAULT (GETDATE())
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hero_slides')
         CREATE TABLE dbo.hero_slides (
            slide_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            sort_order INT NOT NULL CONSTRAINT DF_hero_slides_sort DEFAULT (1),
            eyebrow NVARCHAR(100) NULL,
            title NVARCHAR(255) NOT NULL,
            title_highlight NVARCHAR(255) NULL,
            lead NVARCHAR(1000) NULL,
            cta_primary_label NVARCHAR(100) NULL,
            cta_primary_href NVARCHAR(500) NULL,
            cta_secondary_label NVARCHAR(100) NULL,
            cta_secondary_href NVARCHAR(500) NULL,
            image_url NVARCHAR(1000) NULL,
            image_alt NVARCHAR(255) NULL,
            badge_icon NVARCHAR(64) NULL,
            badge_title NVARCHAR(100) NULL,
            badge_subtitle NVARCHAR(255) NULL,
            theme NVARCHAR(32) NOT NULL CONSTRAINT DF_hero_slides_theme DEFAULT ('rose'),
            theme_color NVARCHAR(32) NULL,
            flag_use BIT NOT NULL CONSTRAINT DF_hero_slides_flag DEFAULT (1),
            created_at DATETIME NOT NULL CONSTRAINT DF_hero_slides_created DEFAULT (GETDATE()),
            updated_at DATETIME NOT NULL CONSTRAINT DF_hero_slides_updated DEFAULT (GETDATE())
         )`,
        `IF COL_LENGTH('dbo.hero_slides', 'theme') IS NULL
         ALTER TABLE dbo.hero_slides ADD theme NVARCHAR(32) NOT NULL
            CONSTRAINT DF_hero_slides_theme_col DEFAULT ('rose')`,
        `IF COL_LENGTH('dbo.hero_slides', 'theme_color') IS NULL
         ALTER TABLE dbo.hero_slides ADD theme_color NVARCHAR(32) NULL`
    ];

    for (const statement of statements) {
        await pool.request().query(statement);
    }

    await seedHeroSlidesIfEmpty(pool);
    await ensureHeroSlideThemes(pool);
    try {
        const { repairHeroSlideImages } = require('./heroImages');
        await repairHeroSlideImages(pool);
    } catch (_) { /* ignore */ }
}

async function ensureHeroSlideThemes(pool) {
    // Diversify existing slides that still use the default theme only when all are 'rose'
    try {
        const rows = await pool.request().query(`
            SELECT slide_id, sort_order, theme
            FROM BD_PTS.dbo.hero_slides
            WHERE flag_use = 1
            ORDER BY sort_order ASC, slide_id ASC
        `);
        const list = rows.recordset || [];
        if (list.length < 2) return;
        const allRose = list.every((r) => !r.theme || String(r.theme).toLowerCase() === 'rose');
        if (!allRose) return;
        const cycle = ['rose', 'sage', 'gold', 'ink', 'ocean', 'sunset'];
        for (let i = 0; i < list.length; i += 1) {
            await pool.request()
                .input('slideId', sql.Int, list[i].slide_id)
                .input('theme', sql.NVarChar, cycle[i % cycle.length])
                .query(`UPDATE BD_PTS.dbo.hero_slides SET theme = @theme WHERE slide_id = @slideId`);
        }
    } catch (_) { /* ignore */ }
}

async function seedHeroSlidesIfEmpty(pool) {
    const count = await pool.request().query(`SELECT COUNT(*) AS c FROM BD_PTS.dbo.hero_slides`);
    if (Number(count.recordset[0].c || 0) > 0) return;

    const seeds = [
        {
            sort_order: 1,
            theme: 'rose',
            eyebrow: 'PTS Learning',
            title: 'ยกระดับทักษะ Personal Assistant สู่มาตรฐานมืออาชีพ',
            title_highlight: 'Personal Assistant',
            lead: 'เรียน Online · Onsite · Hybrid ในระบบเดียว พร้อมตารางเรียน ใบประกาศ และคอมมูนิตี้ผู้ช่วยมืออาชีพ',
            cta_primary_label: 'ดูหลักสูตร',
            cta_primary_href: 'Courses.html',
            cta_secondary_label: 'สมัครสมาชิก',
            cta_secondary_href: 'Register.html',
            image_url: '/uploads/hero/home-banner.png',
            image_alt: 'ผู้ช่วยมืออาชีพทำงานที่โต๊ะด้วยแล็ปท็อป',
            badge_icon: 'check_circle',
            badge_title: 'Certified',
            badge_subtitle: 'หลักสูตรรับรองวิชาชีพ'
        },
        {
            sort_order: 2,
            theme: 'sage',
            eyebrow: 'เรียนได้ทุกที่',
            title: 'เลือกสไตล์การเรียน Online · Onsite · Hybrid ได้ตามชีวิตคุณ',
            title_highlight: 'Online · Onsite · Hybrid',
            lead: 'จัดตารางเรียนเอง เช็กอินออนไซต์ด้วย QR และเรียนต่อออนไลน์ได้เมื่อติดงาน — ครบในแพลตฟอร์มเดียว',
            cta_primary_label: 'เริ่มเลือกโหมดเรียน',
            cta_primary_href: 'Courses.html?mode=online',
            cta_secondary_label: 'สมัครสมาชิก',
            cta_secondary_href: 'Register.html',
            image_url: '/uploads/hero/home-banner.png',
            image_alt: 'ผู้เชี่ยวชาญวางแผนงานอย่างมืออาชีพ',
            badge_icon: 'schedule',
            badge_title: 'Flexible',
            badge_subtitle: 'เรียนได้ตามตารางงานจริง'
        },
        {
            sort_order: 3,
            theme: 'gold',
            eyebrow: 'พร้อมใบประกาศ',
            title: 'จบหลักสูตรได้ ใบประกาศนียบัตร ที่นำไปใช้ต่อได้จริง',
            title_highlight: 'ใบประกาศนียบัตร',
            lead: 'เรียนครบ ทำแบบทดสอบผ่านเกณฑ์ แล้วรับใบประกาศดิจิทัลเก็บในโปรไฟล์ พร้อมคอมมูนิตี้เพื่อนร่วมอาชีพ',
            cta_primary_label: 'ดูใบประกาศ',
            cta_primary_href: 'Certificates.html',
            cta_secondary_label: 'เข้าคอมมูนิตี้',
            cta_secondary_href: 'Community.html',
            image_url: '/uploads/hero/home-banner.png',
            image_alt: 'ทีมงานประชุมพัฒนาทักษะการทำงาน',
            badge_icon: 'workspace_premium',
            badge_title: 'Certificate',
            badge_subtitle: 'เก็บใบประกาศในระบบได้ทันที'
        }
    ];

    for (const s of seeds) {
        await pool.request()
            .input('sort_order', sql.Int, s.sort_order)
            .input('eyebrow', sql.NVarChar, s.eyebrow)
            .input('title', sql.NVarChar, s.title)
            .input('title_highlight', sql.NVarChar, s.title_highlight)
            .input('lead', sql.NVarChar, s.lead)
            .input('cta_primary_label', sql.NVarChar, s.cta_primary_label)
            .input('cta_primary_href', sql.NVarChar, s.cta_primary_href)
            .input('cta_secondary_label', sql.NVarChar, s.cta_secondary_label)
            .input('cta_secondary_href', sql.NVarChar, s.cta_secondary_href)
            .input('image_url', sql.NVarChar, s.image_url)
            .input('image_alt', sql.NVarChar, s.image_alt)
            .input('badge_icon', sql.NVarChar, s.badge_icon)
            .input('badge_title', sql.NVarChar, s.badge_title)
            .input('badge_subtitle', sql.NVarChar, s.badge_subtitle)
            .input('theme', sql.NVarChar, s.theme || 'rose')
            .query(`
                INSERT INTO BD_PTS.dbo.hero_slides (
                    sort_order, eyebrow, title, title_highlight, lead,
                    cta_primary_label, cta_primary_href, cta_secondary_label, cta_secondary_href,
                    image_url, image_alt, badge_icon, badge_title, badge_subtitle, theme, flag_use
                ) VALUES (
                    @sort_order, @eyebrow, @title, @title_highlight, @lead,
                    @cta_primary_label, @cta_primary_href, @cta_secondary_label, @cta_secondary_href,
                    @image_url, @image_alt, @badge_icon, @badge_title, @badge_subtitle, @theme, 1
                )
            `);
    }
}

async function createNotification(pool, userId, title, body, linkUrl) {
    await pool.request()
        .input('userId', sql.Int, userId)
        .input('title', sql.NVarChar, title)
        .input('body', sql.NVarChar, body || null)
        .input('link', sql.NVarChar, linkUrl || null)
        .query(`
            INSERT INTO BD_PTS.dbo.notifications (user_id, title, body, link_url, is_read)
            VALUES (@userId, @title, @body, @link, 0)
        `);
}

module.exports = { ensureLearningSchema, createNotification };
