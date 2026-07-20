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
            method VARCHAR(40) NOT NULL CONSTRAINT DF_payments_method DEFAULT ('promptpay_mock'),
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
        `IF COL_LENGTH('dbo.courses_main', 'price') IS NULL
         ALTER TABLE dbo.courses_main ADD price DECIMAL(10,2) NULL`,
        `IF COL_LENGTH('dbo.courses_main', 'description') IS NULL
         ALTER TABLE dbo.courses_main ADD description NVARCHAR(MAX) NULL`
    ];

    for (const statement of statements) {
        await pool.request().query(statement);
    }

    await seedSchedulesIfEmpty(pool);
    await backfillCoursePrices(pool);
}

async function backfillCoursePrices(pool) {
    try {
        await pool.request().query(`
            UPDATE BD_PTS.dbo.courses_main
            SET price = CASE
                WHEN LOWER(ISNULL(delivery_mode,'')) = 'onsite' THEN 3900
                WHEN LOWER(ISNULL(delivery_mode,'')) = 'hybrid' THEN 2900
                ELSE 1900
            END
            WHERE price IS NULL
        `);
        await pool.request().query(`
            UPDATE BD_PTS.dbo.courses_main
            SET description = N'หลักสูตรพัฒนาทักษะ Personal Assistant แบบมืออาชีพ จาก PTS Academy ครอบคลุมทั้งทฤษฎีและการฝึกปฏิบัติ'
            WHERE description IS NULL OR LTRIM(RTRIM(description)) = ''
        `);
    } catch (e) {
        console.error('⚠️ backfill course price/description:', e.message);
    }
}

async function seedSchedulesIfEmpty(pool) {
    try {
        const count = await pool.request().query(`SELECT COUNT(*) AS cnt FROM BD_PTS.dbo.class_schedules WHERE flag_use = 1`);
        if (count.recordset[0].cnt > 0) return;

        const course = await pool.request().query(`SELECT TOP 1 course_id, course_name FROM BD_PTS.dbo.courses_main ORDER BY created_at DESC`);
        const courseId = course.recordset[0]?.course_id || null;
        const courseName = course.recordset[0]?.course_name || 'PTS Workshop';

        const schedules = [
            { title: `Workshop: ${courseName}`, days: 2, hours: 10, mode: 'online', loc: 'Zoom Meeting', url: 'https://zoom.us' },
            { title: 'Onsite Practice: Executive Support', days: 5, hours: 13, mode: 'onsite', loc: 'PTS Academy Bangkok', url: null },
            { title: 'Hybrid Clinic: Time Management', days: 9, hours: 14, mode: 'hybrid', loc: 'Online + Onsite', url: 'https://meet.google.com' }
        ];

        for (const s of schedules) {
            await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('title', sql.NVarChar, s.title)
                .input('startAt', sql.DateTime, new Date(Date.now() + s.days * 86400000 + s.hours * 3600000))
                .input('endAt', sql.DateTime, new Date(Date.now() + s.days * 86400000 + (s.hours + 2) * 3600000))
                .input('location', sql.NVarChar, s.loc)
                .input('meeting', sql.NVarChar, s.url)
                .input('mode', sql.VarChar, s.mode)
                .query(`
                    INSERT INTO BD_PTS.dbo.class_schedules
                    (course_id, title, start_at, end_at, location, meeting_url, delivery_mode, flag_use)
                    VALUES (@courseId, @title, @startAt, @endAt, @location, @meeting, @mode, 1)
                `);
        }
        console.log('📅 Seeded sample class schedules');
    } catch (e) {
        console.error('⚠️ seed schedules:', e.message);
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

async function seedLessonsIfEmpty(pool, courseId, courseName) {
    const count = await pool.request()
        .input('courseId', sql.Int, courseId)
        .query(`SELECT COUNT(*) AS cnt FROM BD_PTS.dbo.course_lessons WHERE course_id = @courseId AND flag_use = 1`);

    if (count.recordset[0].cnt > 0) return;

    const lessons = [
        {
            title: `บทที่ 1: แนะนำคอร์ส ${courseName || ''}`.trim(),
            content: `<p>ยินดีต้อนรับสู่บทเรียนแรก บทนี้อธิบายภาพรวมของหลักสูตร เป้าหมายการเรียนรู้ และวิธีเรียนให้ได้ผล</p><ul><li>รู้จักบทบาท PA</li><li>เป้าหมายของคอร์ส</li><li>แนวทางการเรียน</li></ul>`,
            video: '',
            sort: 1,
            duration: 12
        },
        {
            title: 'บทที่ 2: ทักษะหลักที่ต้องฝึก',
            content: `<p>เรียนรู้ทักษะสำคัญในการทำงานจริง พร้อมตัวอย่างสถานการณ์และแนวทางปฏิบัติ</p><p>ลองจดโน้ตสั้นๆ ระหว่างเรียน แล้วทำแบบฝึกหัดท้ายบท</p>`,
            video: '',
            sort: 2,
            duration: 20
        },
        {
            title: 'บทที่ 3: สรุปและนำไปใช้จริง',
            content: `<p>สรุปความรู้ทั้งหมด และ checklist สำหรับนำไปใช้ในงานประจำวัน</p><ol><li>ทบทวนจุดสำคัญ</li><li>วางแผนการนำไปใช้</li><li>เตรียมสอบใบประกาศ</li></ol>`,
            video: '',
            sort: 3,
            duration: 15
        }
    ];

    for (const lesson of lessons) {
        await pool.request()
            .input('courseId', sql.Int, courseId)
            .input('title', sql.NVarChar, lesson.title)
            .input('content', sql.NVarChar, lesson.content)
            .input('video', sql.NVarChar, lesson.video || null)
            .input('sort', sql.Int, lesson.sort)
            .input('duration', sql.Int, lesson.duration)
            .query(`
                INSERT INTO BD_PTS.dbo.course_lessons
                (course_id, title, content_html, video_url, sort_order, duration_minutes, flag_use)
                VALUES (@courseId, @title, @content, @video, @sort, @duration, 1)
            `);
    }
}

module.exports = { ensureLearningSchema, seedLessonsIfEmpty, createNotification, seedSchedulesIfEmpty };
