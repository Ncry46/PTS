-- courses_main — ตารางหลักสูตร (อ้างอิง schema จริง)
-- backend/ensureSchema.js จะ ADD คอลัมน์ที่ยังไม่มีเมื่อสตาร์ทเซิร์ฟเวอร์

/*
  Fields:
    course_id
    course_name
    instructor_name
    delivery_mode
    total_hours
    average_rating
    total_reviews
    cover_image_url
    is_featured
    coursesFlag
    created_at
    price
    description
    flag_use
    coursescat_id
    total_enrolled
    start_date
    is_open_soon
*/

IF OBJECT_ID('dbo.courses_main', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.courses_main (
    course_id         INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    course_name       NVARCHAR(255) NOT NULL,
    instructor_name   NVARCHAR(255) NULL,
    delivery_mode     VARCHAR(20) NULL,
    total_hours       DECIMAL(10,2) NULL,
    average_rating    DECIMAL(4,2) NULL,
    total_reviews     INT NULL,
    cover_image_url   NVARCHAR(1000) NULL,
    is_featured       BIT NOT NULL CONSTRAINT DF_courses_main_featured DEFAULT (0),
    coursesFlag       NVARCHAR(10) NULL,
    created_at        DATETIME NOT NULL CONSTRAINT DF_courses_main_created DEFAULT (GETDATE()),
    price             DECIMAL(10,2) NULL,
    description       NVARCHAR(MAX) NULL,
    flag_use          BIT NOT NULL CONSTRAINT DF_courses_main_flag_use DEFAULT (1),
    coursescat_id     INT NULL,
    total_enrolled    INT NOT NULL CONSTRAINT DF_courses_main_enrolled DEFAULT (0),
    start_date        DATE NULL,
    is_open_soon      BIT NOT NULL CONSTRAINT DF_courses_main_open_soon DEFAULT (0)
  );
END
GO
