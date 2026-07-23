-- Home hero carousel slides (managed in Admin → แบนเนอร์)
-- Auto-created by backend/ensureSchema.js on server start.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'hero_slides')
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
    flag_use BIT NOT NULL CONSTRAINT DF_hero_slides_flag DEFAULT (1),
    created_at DATETIME NOT NULL CONSTRAINT DF_hero_slides_created DEFAULT (GETDATE()),
    updated_at DATETIME NOT NULL CONSTRAINT DF_hero_slides_updated DEFAULT (GETDATE())
);
