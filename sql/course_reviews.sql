-- course_reviews — รีวิวหลักสูตร (ต้องสมัคร + จ่ายเงินแล้ว)
IF OBJECT_ID('dbo.course_reviews', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.course_reviews (
    review_id   INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    course_id   INT NOT NULL,
    user_id     INT NOT NULL,
    rating      TINYINT NOT NULL,
    comment     NVARCHAR(1000) NULL,
    created_at  DATETIME NOT NULL CONSTRAINT DF_course_reviews_created DEFAULT (GETDATE()),
    updated_at  DATETIME NOT NULL CONSTRAINT DF_course_reviews_updated DEFAULT (GETDATE()),
    flag_use    BIT NOT NULL CONSTRAINT DF_course_reviews_flag DEFAULT (1),
    CONSTRAINT CK_course_reviews_rating CHECK (rating BETWEEN 1 AND 5),
    CONSTRAINT UQ_course_reviews_user_course UNIQUE (course_id, user_id)
  );
END
GO
