-- PTS Learning: ตารางรองรับสมัครเรียน / ความคืบหน้า
-- รันบน SQL Server database BD_PTS ได้ตามต้องการ
-- หมายเหตุ: โค้ด backend จะพยายามสร้างตารางนี้ให้อัตโนมัติถ้ายังไม่มี

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'course_enrollments')
BEGIN
    CREATE TABLE dbo.course_enrollments (
        enrollment_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        user_id INT NOT NULL,
        course_id INT NOT NULL,
        progress_percent INT NOT NULL CONSTRAINT DF_course_enrollments_progress DEFAULT (0),
        status VARCHAR(20) NOT NULL CONSTRAINT DF_course_enrollments_status DEFAULT ('in_progress'),
        enrolled_at DATETIME NOT NULL CONSTRAINT DF_course_enrollments_enrolled DEFAULT (GETDATE()),
        updated_at DATETIME NOT NULL CONSTRAINT DF_course_enrollments_updated DEFAULT (GETDATE()),
        CONSTRAINT UQ_course_enrollments_user_course UNIQUE (user_id, course_id)
    );
END
GO
