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
        `IF COL_LENGTH('dbo.courses_main', 'price') IS NULL
         ALTER TABLE dbo.courses_main ADD price DECIMAL(10,2) NULL`,
        `IF COL_LENGTH('dbo.courses_main', 'description') IS NULL
         ALTER TABLE dbo.courses_main ADD description NVARCHAR(MAX) NULL`
    ];

    for (const statement of statements) {
        await pool.request().query(statement);
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
