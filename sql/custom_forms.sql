-- Custom web forms (auto-created by ensureSchema.js as well)
-- Admin manages forms/questions; logged-in users submit answers.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'custom_forms')
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
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'custom_form_questions')
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
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'custom_form_responses')
CREATE TABLE dbo.custom_form_responses (
  response_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  form_id INT NOT NULL,
  user_id INT NOT NULL,
  submitted_at DATETIME NOT NULL CONSTRAINT DF_custom_fr_sub DEFAULT (GETDATE())
);

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'custom_form_answers')
CREATE TABLE dbo.custom_form_answers (
  answer_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  response_id INT NOT NULL,
  question_id INT NOT NULL,
  answer_text NVARCHAR(MAX) NULL
);
