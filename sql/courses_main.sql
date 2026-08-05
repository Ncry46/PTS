-- courses — ตารางหลักสูตร
-- ensureSchema.js จะ CREATE อัตโนมัติตอน npm start ถ้ายังไม่มี

IF OBJECT_ID('dbo.courses', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.courses (
    course_id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    course_name       NVARCHAR(255) NOT NULL,
    instructor_name   NVARCHAR(255) NULL,
    delivery_mode     VARCHAR(20) NULL,
    total_hours       DECIMAL(10,2) NULL,
    average_rating    DECIMAL(4,2) NULL,
    total_reviews     INT NULL,
    cover_image_url   NVARCHAR(1000) NULL,
    is_featured       BIT NOT NULL CONSTRAINT DF_courses_featured DEFAULT (0),
    coursesFlag       NVARCHAR(10) NULL,
    created_at        DATETIME NOT NULL CONSTRAINT DF_courses_created DEFAULT (GETDATE()),
    price             DECIMAL(10,2) NULL,
    description       NVARCHAR(MAX) NULL,
    flag_use          BIT NOT NULL CONSTRAINT DF_courses_flag_use DEFAULT (1),
    coursescat_id     INT NULL,
    total_enrolled    INT NOT NULL CONSTRAINT DF_courses_enrolled DEFAULT (0),
    start_date        DATE NULL,
    is_open_soon      BIT NOT NULL CONSTRAINT DF_courses_open_soon DEFAULT (0)
  );
END
GO
