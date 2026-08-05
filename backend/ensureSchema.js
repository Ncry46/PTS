const sql = require('mssql');
const { isAutoSchemaEnabled } = require('./db');

async function ensureLearningSchema(pool) {
    if (!isAutoSchemaEnabled()) {
        return;
    }
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
        `IF COL_LENGTH('dbo.payments', 'source') IS NULL
         ALTER TABLE dbo.payments ADD source VARCHAR(32) NOT NULL
            CONSTRAINT DF_payments_source DEFAULT ('direct_signup')`,
        `IF COL_LENGTH('dbo.payments', 'slip_image_url') IS NULL
         ALTER TABLE dbo.payments ADD slip_image_url NVARCHAR(500) NULL`,
        `IF COL_LENGTH('dbo.payments', 'transfer_at') IS NULL
         ALTER TABLE dbo.payments ADD transfer_at DATETIME NULL`,
        `IF COL_LENGTH('dbo.payments', 'reviewed_by') IS NULL
         ALTER TABLE dbo.payments ADD reviewed_by INT NULL`,
        `IF COL_LENGTH('dbo.payments', 'reviewed_at') IS NULL
         ALTER TABLE dbo.payments ADD reviewed_at DATETIME NULL`,
        `IF COL_LENGTH('dbo.payments', 'reject_reason') IS NULL
         ALTER TABLE dbo.payments ADD reject_reason NVARCHAR(500) NULL`,
        `IF COL_LENGTH('dbo.payments', 'access_code_id') IS NULL
         ALTER TABLE dbo.payments ADD access_code_id INT NULL`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'access_codes')
         CREATE TABLE dbo.access_codes (
            access_code_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            code VARCHAR(64) NOT NULL,
            course_id INT NOT NULL,
            max_uses INT NULL,
            used_count INT NOT NULL CONSTRAINT DF_access_codes_used DEFAULT (0),
            expires_at DATETIME NULL,
            note NVARCHAR(255) NULL,
            flag_use BIT NOT NULL CONSTRAINT DF_access_codes_flag DEFAULT (1),
            created_by INT NULL,
            created_at DATETIME NOT NULL CONSTRAINT DF_access_codes_created DEFAULT (GETDATE()),
            CONSTRAINT UQ_access_codes_code UNIQUE (code)
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
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'line_account_links')
         CREATE TABLE dbo.line_account_links (
            user_id INT NOT NULL PRIMARY KEY,
            line_user_id NVARCHAR(64) NOT NULL,
            display_name NVARCHAR(255) NULL,
            picture_url NVARCHAR(1000) NULL,
            notify_enabled BIT NOT NULL CONSTRAINT DF_line_links_notify DEFAULT (1),
            linked_at DATETIME NOT NULL CONSTRAINT DF_line_links_linked DEFAULT (GETDATE()),
            updated_at DATETIME NOT NULL CONSTRAINT DF_line_links_updated DEFAULT (GETDATE()),
            CONSTRAINT UQ_line_account_links_line_user UNIQUE (line_user_id)
         )`,
        `IF COL_LENGTH('dbo.course_enrollments', 'gcal_notify') IS NULL
         ALTER TABLE dbo.course_enrollments ADD gcal_notify BIT NOT NULL
            CONSTRAINT DF_course_enrollments_gcal_notify DEFAULT (0)`,

        /* —— courses_main (สร้างก่อน แล้วค่อยเติมคอลัมน์ถ้าตารางเก่ายังขาด) —— */
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NULL
         CREATE TABLE dbo.courses_main (
            course_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            course_name NVARCHAR(255) NOT NULL,
            instructor_name NVARCHAR(255) NULL,
            delivery_mode VARCHAR(20) NULL,
            total_hours DECIMAL(10,2) NULL,
            average_rating DECIMAL(4,2) NULL,
            total_reviews INT NULL,
            cover_image_url NVARCHAR(1000) NULL,
            is_featured BIT NOT NULL CONSTRAINT DF_courses_main_featured DEFAULT (0),
            coursesFlag NVARCHAR(10) NULL,
            created_at DATETIME NOT NULL CONSTRAINT DF_courses_main_created DEFAULT (GETDATE()),
            price DECIMAL(10,2) NULL,
            description NVARCHAR(MAX) NULL,
            flag_use BIT NOT NULL CONSTRAINT DF_courses_main_flag_use DEFAULT (1),
            coursescat_id INT NULL,
            total_enrolled INT NOT NULL CONSTRAINT DF_courses_main_enrolled DEFAULT (0),
            start_date DATE NULL,
            is_open_soon BIT NOT NULL CONSTRAINT DF_courses_main_open_soon DEFAULT (0)
         )`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'price') IS NULL
         ALTER TABLE dbo.courses_main ADD price DECIMAL(10,2) NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'description') IS NULL
         ALTER TABLE dbo.courses_main ADD description NVARCHAR(MAX) NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'flag_use') IS NULL
         ALTER TABLE dbo.courses_main ADD flag_use BIT NOT NULL
            CONSTRAINT DF_courses_main_flag_use DEFAULT (1)`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'coursesFlag') IS NULL
         ALTER TABLE dbo.courses_main ADD coursesFlag NVARCHAR(10) NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'coursescat_id') IS NULL
         ALTER TABLE dbo.courses_main ADD coursescat_id INT NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'total_enrolled') IS NULL
         ALTER TABLE dbo.courses_main ADD total_enrolled INT NOT NULL
            CONSTRAINT DF_courses_main_enrolled DEFAULT (0)`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'start_date') IS NULL
         ALTER TABLE dbo.courses_main ADD start_date DATE NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'is_open_soon') IS NULL
         ALTER TABLE dbo.courses_main ADD is_open_soon BIT NOT NULL
            CONSTRAINT DF_courses_main_open_soon DEFAULT (0)`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'instructor_name') IS NULL
         ALTER TABLE dbo.courses_main ADD instructor_name NVARCHAR(255) NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'delivery_mode') IS NULL
         ALTER TABLE dbo.courses_main ADD delivery_mode VARCHAR(20) NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'total_hours') IS NULL
         ALTER TABLE dbo.courses_main ADD total_hours DECIMAL(10,2) NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'average_rating') IS NULL
         ALTER TABLE dbo.courses_main ADD average_rating DECIMAL(4,2) NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'total_reviews') IS NULL
         ALTER TABLE dbo.courses_main ADD total_reviews INT NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'cover_image_url') IS NULL
         ALTER TABLE dbo.courses_main ADD cover_image_url NVARCHAR(1000) NULL`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'is_featured') IS NULL
         ALTER TABLE dbo.courses_main ADD is_featured BIT NOT NULL
            CONSTRAINT DF_courses_main_featured DEFAULT (0)`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'created_at') IS NULL
         ALTER TABLE dbo.courses_main ADD created_at DATETIME NOT NULL
            CONSTRAINT DF_courses_main_created DEFAULT (GETDATE())`,
        `IF OBJECT_ID('dbo.courses_main', 'U') IS NOT NULL AND COL_LENGTH('dbo.courses_main', 'course_name') IS NULL
         ALTER TABLE dbo.courses_main ADD course_name NVARCHAR(255) NULL`,
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
         ALTER TABLE dbo.hero_slides ADD theme_color NVARCHAR(32) NULL`,

        /* —— Custom web forms (admin builds questions; users submit) —— */
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'custom_forms')
         CREATE TABLE dbo.custom_forms (
            form_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            title NVARCHAR(255) NOT NULL,
            description NVARCHAR(MAX) NULL,
            is_published BIT NOT NULL CONSTRAINT DF_custom_forms_pub DEFAULT (0),
            allow_resubmit BIT NOT NULL CONSTRAINT DF_custom_forms_resub DEFAULT (0),
            flag_use BIT NOT NULL CONSTRAINT DF_custom_forms_flag DEFAULT (1),
            created_by INT NULL,
            created_at DATETIME NOT NULL CONSTRAINT DF_custom_forms_created DEFAULT (GETDATE()),
            updated_at DATETIME NOT NULL CONSTRAINT DF_custom_forms_updated DEFAULT (GETDATE())
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'custom_form_questions')
         CREATE TABLE dbo.custom_form_questions (
            question_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            form_id INT NOT NULL,
            label NVARCHAR(500) NOT NULL,
            help_text NVARCHAR(1000) NULL,
            question_type VARCHAR(32) NOT NULL CONSTRAINT DF_custom_fq_type DEFAULT ('text'),
            options_json NVARCHAR(MAX) NULL,
            is_required BIT NOT NULL CONSTRAINT DF_custom_fq_req DEFAULT (1),
            sort_order INT NOT NULL CONSTRAINT DF_custom_fq_sort DEFAULT (1),
            flag_use BIT NOT NULL CONSTRAINT DF_custom_fq_flag DEFAULT (1),
            created_at DATETIME NOT NULL CONSTRAINT DF_custom_fq_created DEFAULT (GETDATE())
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'custom_form_responses')
         CREATE TABLE dbo.custom_form_responses (
            response_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            form_id INT NOT NULL,
            user_id INT NOT NULL,
            submitted_at DATETIME NOT NULL CONSTRAINT DF_custom_fr_sub DEFAULT (GETDATE())
         )`,
        `IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'custom_form_answers')
         CREATE TABLE dbo.custom_form_answers (
            answer_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            response_id INT NOT NULL,
            question_id INT NOT NULL,
            answer_text NVARCHAR(MAX) NULL
         )`,
        `IF COL_LENGTH('dbo.custom_forms', 'form_type') IS NULL
         ALTER TABLE dbo.custom_forms ADD form_type VARCHAR(20) NOT NULL
            CONSTRAINT DF_custom_forms_type DEFAULT ('general')`,
        `IF COL_LENGTH('dbo.custom_forms', 'course_id') IS NULL
         ALTER TABLE dbo.custom_forms ADD course_id INT NULL`,
        `IF COL_LENGTH('dbo.custom_form_responses', 'result_code') IS NULL
         ALTER TABLE dbo.custom_form_responses ADD result_code VARCHAR(8) NULL`,
        `IF COL_LENGTH('dbo.custom_form_responses', 'result_label') IS NULL
         ALTER TABLE dbo.custom_form_responses ADD result_label NVARCHAR(100) NULL`,
        `IF COL_LENGTH('dbo.custom_form_responses', 'result_json') IS NULL
         ALTER TABLE dbo.custom_form_responses ADD result_json NVARCHAR(MAX) NULL`,
        `IF COL_LENGTH('dbo.users_main', 'disc_code') IS NULL
         ALTER TABLE dbo.users_main ADD disc_code VARCHAR(8) NULL`,
        `IF COL_LENGTH('dbo.users_main', 'disc_label') IS NULL
         ALTER TABLE dbo.users_main ADD disc_label NVARCHAR(100) NULL`,
        `IF COL_LENGTH('dbo.users_main', 'disc_updated_at') IS NULL
         ALTER TABLE dbo.users_main ADD disc_updated_at DATETIME NULL`
    ];

    let failed = 0;
    for (const statement of statements) {
        try {
            await pool.request().query(statement);
        } catch (err) {
            failed += 1;
            const preview = String(statement).replace(/\s+/g, ' ').trim().slice(0, 120);
            console.warn(`[schema] skip (${failed}): ${err.message} :: ${preview}`);
        }
    }
    if (failed) {
        console.warn(`[schema] completed with ${failed} skipped statement(s)`);
    }

    await migrateGcalNotifyOptIn(pool);
    await seedHeroSlidesIfEmpty(pool);
    await ensureHeroSlideThemes(pool);
    await seedSampleCourseIfEmpty(pool);
    await seedSampleFormIfEmpty(pool);
    try {
        const { repairHeroSlideImages } = require('./heroImages');
        await repairHeroSlideImages(pool);
    } catch (_) { /* ignore */ }
}

async function migrateGcalNotifyOptIn(pool) {
    // Per-course calendar notify is opt-in (default OFF). Migrate older DEFAULT(1) installs once.
    try {
        const col = await pool.request().query(`
            SELECT COL_LENGTH('dbo.course_enrollments', 'gcal_notify') AS col_len
        `);
        if (!col.recordset[0] || col.recordset[0].col_len == null) return;

        const def = await pool.request().query(`
            SELECT definition
            FROM sys.default_constraints
            WHERE parent_object_id = OBJECT_ID('dbo.course_enrollments')
              AND name = 'DF_course_enrollments_gcal_notify'
        `);
        const definition = String((def.recordset[0] && def.recordset[0].definition) || '');
        if (definition.includes('(0)')) return;

        if (definition) {
            await pool.request().query(`
                ALTER TABLE dbo.course_enrollments DROP CONSTRAINT DF_course_enrollments_gcal_notify
            `);
        }
        await pool.request().query(`
            ALTER TABLE dbo.course_enrollments
            ADD CONSTRAINT DF_course_enrollments_gcal_notify DEFAULT (0) FOR gcal_notify
        `);
        // Reset so users must opt in themselves
        await pool.request().query(`
            UPDATE dbo.course_enrollments SET gcal_notify = 0 WHERE gcal_notify = 1
        `);
    } catch (err) {
        console.warn('[schema] migrateGcalNotifyOptIn:', err.message);
    }
}

async function ensureHeroSlideThemes(pool) {
    // Diversify existing slides that still use the default theme only when all are 'rose'
    try {
        const rows = await pool.request().query(`
            SELECT slide_id, sort_order, theme
            FROM dbo.hero_slides
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
                .query(`UPDATE dbo.hero_slides SET theme = @theme WHERE slide_id = @slideId`);
        }
    } catch (_) { /* ignore */ }
}

async function seedHeroSlidesIfEmpty(pool) {
    const count = await pool.request().query(`SELECT COUNT(*) AS c FROM dbo.hero_slides`);
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
                INSERT INTO dbo.hero_slides (
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

async function seedSampleCourseIfEmpty(pool) {
    try {
        const exists = await pool.request().query(`
            SELECT OBJECT_ID('dbo.courses_main', 'U') AS oid
        `);
        if (!exists.recordset[0] || !exists.recordset[0].oid) return;

        const count = await pool.request().query(`
            SELECT COUNT(*) AS c FROM dbo.courses_main WHERE ISNULL(flag_use, 1) = 1
        `);
        if (Number(count.recordset[0].c || 0) > 0) return;

        await pool.request()
            .input('name', sql.NVarChar, 'หลักสูตรตัวอย่าง PTS')
            .input('instructor', sql.NVarChar, 'PTS Instructor')
            .input('mode', sql.VarChar, 'online')
            .input('hours', sql.Decimal(10, 2), 4)
            .input('price', sql.Decimal(10, 2), 990)
            .input('desc', sql.NVarChar, 'หลักสูตรตัวอย่างสำหรับทดสอบระบบ — แก้ไขหรือลบได้จากหน้า Admin')
            .query(`
                INSERT INTO dbo.courses_main
                (course_name, instructor_name, delivery_mode, total_hours,
                 average_rating, total_reviews, cover_image_url, is_featured,
                 coursesFlag, created_at, price, description, flag_use,
                 coursescat_id, total_enrolled, start_date, is_open_soon)
                VALUES
                (@name, @instructor, @mode, @hours,
                 0, 0, NULL, 1,
                 N'Y', GETDATE(), @price, @desc, 1,
                 NULL, 0, CAST(GETDATE() AS DATE), 0)
            `);
        console.log('📚 Seeded sample course into courses_main');
    } catch (err) {
        console.warn('[schema] seedSampleCourseIfEmpty:', err.message);
    }
}

async function createNotification(pool, userId, title, body, linkUrl) {
    await pool.request()
        .input('userId', sql.Int, userId)
        .input('title', sql.NVarChar, title)
        .input('body', sql.NVarChar, body || null)
        .input('link', sql.NVarChar, linkUrl || null)
        .query(`
            INSERT INTO dbo.notifications (user_id, title, body, link_url, is_read)
            VALUES (@userId, @title, @body, @link, 0)
        `);

    // Mirror to LINE OA when the user linked their account (best-effort)
    try {
        const pref = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT line_user_id, notify_enabled
                FROM dbo.line_account_links
                WHERE user_id = @userId
            `);
        const row = pref.recordset[0];
        if (row && Number(row.notify_enabled) === 1 && row.line_user_id) {
            const {
                pushMessage,
                buildNotifyFlex,
                buildRegistrationSuccessFlex,
                buildPaymentFlex,
                isMessagingConfigured
            } = require('./lineMessaging');
            if (isMessagingConfigured()) {
                const titleStr = String(title || '');
                const bodyStr = String(body || '');
                let flex;
                if (/ชำระ|จ่าย|payment|pay|ค้างชำระ/i.test(titleStr + bodyStr)) {
                    flex = buildPaymentFlex({
                        courseName: bodyStr,
                        payUrl: linkUrl,
                        linkUrl
                    });
                } else if (/สำเร็จ|เปิดสิทธิ์|ลงทะเบียน|สมัคร/i.test(titleStr)) {
                    const codeMatch = bodyStr.match(/#PTS-\d+/i);
                    flex = buildRegistrationSuccessFlex({
                        title: titleStr,
                        code: codeMatch ? codeMatch[0] : '',
                        courseName: bodyStr.replace(/·\s*รหัส.*$/i, '').replace(/^หลักสูตร\s*/i, '').trim(),
                        linkUrl
                    });
                } else {
                    flex = buildNotifyFlex(title, body, linkUrl);
                }
                await pushMessage(row.line_user_id, [flex]);
            }
        }
    } catch (err) {
        console.warn('[notify→LINE]', err.message);
    }
}

async function seedSampleFormIfEmpty(pool) {
    try {
        const count = await pool.request().query(`SELECT COUNT(*) AS c FROM dbo.custom_forms`);
        if (Number(count.recordset[0].c || 0) > 0) return;

        const form = await pool.request()
            .input('title', sql.NVarChar, 'แบบประเมินสไตล์ DISC')
            .input('description', sql.NVarChar, 'ตอบคำถามเพื่อดูว่าคุณใกล้เคียงสไตล์ใด: D กระทิง · I อินทรี · S หนู · C หมี')
            .query(`
                INSERT INTO dbo.custom_forms
                    (title, description, is_published, allow_resubmit, flag_use, form_type)
                OUTPUT INSERTED.form_id
                VALUES (@title, @description, 1, 1, 1, 'disc')
            `);
        const formId = form.recordset[0].form_id;
        const discOpts = JSON.stringify([
            'D : กระทิง',
            'I : อินทรี',
            'S : หนู',
            'C : หมี',
            'U : ยังไม่ทราบ'
        ]);
        const questions = [
            { label: 'เมื่อต้องทำงานเป็นทีม คุณมักเป็นคนแบบไหน?', sort: 1 },
            { label: 'เวลาเจอปัญหาฉุกเฉิน คุณมักตอบสนองอย่างไร?', sort: 2 },
            { label: 'สไตล์การสื่อสารที่คุณถนัดที่สุดคือข้อใด?', sort: 3 },
            { label: 'เมื่อต้องตัดสินใจสำคัญ คุณโน้มเอียงไปทางใด?', sort: 4 },
            { label: 'โดยรวมแล้ว คุณรู้สึกว่าตัวเองใกล้เคียงสัตว์ใดที่สุด?', sort: 5 }
        ];
        for (const q of questions) {
            await pool.request()
                .input('formId', sql.Int, formId)
                .input('label', sql.NVarChar, q.label)
                .input('qType', sql.VarChar, 'radio')
                .input('opts', sql.NVarChar, discOpts)
                .input('req', sql.Bit, 1)
                .input('sort', sql.Int, q.sort)
                .query(`
                    INSERT INTO dbo.custom_form_questions
                        (form_id, label, question_type, options_json, is_required, sort_order, flag_use)
                    VALUES (@formId, @label, @qType, @opts, @req, @sort, 1)
                `);
        }
    } catch (err) {
        console.warn('[schema] seedSampleFormIfEmpty:', err.message);
    }
}

module.exports = { ensureLearningSchema, createNotification };
