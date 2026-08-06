-- Custom Forms (แบบฟอร์ม)
-- Run manually if needed; backend/ensureSchema.js also creates/migrates these on startup.
--
-- Form types:
--   general  = แบบฟอร์มทั่วไป
--   disc     = แบบประเมินสไตล์ DISC
--              D : กระทิง · I : อินทรี · S : หนู · C : หมี · U : ยังไม่ทราบ
--   course   = แบบฟอร์มก่อนเริ่มคอร์ส (ต้องลิงก์ course_id)

IF OBJECT_ID('dbo.custom_forms', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.custom_forms (
    form_id           INT IDENTITY(1,1) PRIMARY KEY,
    section_title             NVARCHAR(255)  NOT NULL,
    description       NVARCHAR(MAX)  NULL,
    is_published      BIT            NOT NULL CONSTRAINT DF_custom_forms_pub DEFAULT 0,
    allow_resubmit    BIT            NOT NULL CONSTRAINT DF_custom_forms_resub DEFAULT 0,
    form_type         VARCHAR(20)    NOT NULL CONSTRAINT DF_custom_forms_type DEFAULT ('general'),
    course_id         INT            NULL,
    flag_use          BIT            NOT NULL CONSTRAINT DF_custom_forms_flag DEFAULT 1,
    created_by        INT            NULL,
    created_at        DATETIME       NOT NULL CONSTRAINT DF_custom_forms_created DEFAULT (GETDATE()),
    updated_at        DATETIME       NOT NULL CONSTRAINT DF_custom_forms_updated DEFAULT (GETDATE())
  );
END
GO

IF OBJECT_ID('dbo.custom_form_questions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.custom_form_questions (
    question_id       INT IDENTITY(1,1) PRIMARY KEY,
    form_id           INT            NOT NULL,
    label             NVARCHAR(500)  NOT NULL,
    help_text         NVARCHAR(1000) NULL,
    question_type     VARCHAR(32)    NOT NULL CONSTRAINT DF_custom_fq_type DEFAULT ('text'),
    options_json      NVARCHAR(MAX)  NULL,
    is_required       BIT            NOT NULL CONSTRAINT DF_custom_fq_req DEFAULT 1,
    flag_use        INT            NOT NULL CONSTRAINT DF_custom_fq_sort DEFAULT 1,
    flag_use          BIT            NOT NULL CONSTRAINT DF_custom_fq_flag DEFAULT 1,
    created_at        DATETIME       NOT NULL CONSTRAINT DF_custom_fq_created DEFAULT (GETDATE())
  );
END
GO

IF OBJECT_ID('dbo.custom_form_responses', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.custom_form_responses (
    response_id       INT IDENTITY(1,1) PRIMARY KEY,
    form_id           INT            NOT NULL,
    user_id           INT            NOT NULL,
    submitted_at      DATETIME       NOT NULL CONSTRAINT DF_custom_fr_sub DEFAULT (GETDATE()),
    result_code       VARCHAR(8)     NULL,
    result_label      NVARCHAR(100)  NULL,
    result_json       NVARCHAR(MAX)  NULL
  );
END
GO

IF OBJECT_ID('dbo.custom_form_answers', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.custom_form_answers (
    answer_id         INT IDENTITY(1,1) PRIMARY KEY,
    response_id       INT            NOT NULL,
    question_id       INT            NOT NULL,
    answer_text       NVARCHAR(MAX)  NULL
  );
END
GO

-- Optional user DISC profile columns
IF COL_LENGTH('dbo.users', 'disc_code') IS NULL
  ALTER TABLE dbo.users ADD disc_code VARCHAR(8) NULL;
IF COL_LENGTH('dbo.users', 'disc_label') IS NULL
  ALTER TABLE dbo.users ADD disc_label NVARCHAR(100) NULL;
IF COL_LENGTH('dbo.users', 'disc_updated_at') IS NULL
  ALTER TABLE dbo.users ADD disc_updated_at DATETIME NULL;
GO
