# Media files metadata — design

Date: 2026-08-13

## Goal
Store rich metadata for every uploaded image (date/time, source category, file info, Drive ids) in SQL Server, keep full history including old files, and keep existing public URL columns working. No admin UI — backend team inspects `dbo.media_files` in SSMS.

## Decisions
- Central table `dbo.media_files` (approach A)
- Full history: each upload INSERTs a new row; previous current rows for the same ref become `is_current = 0`
- Do **not** delete old local files on replace
- Categories: `avatars`, `community`, `slips`, `hero`, `cert`
- Existing columns (`users.Url`, `community_posts.image_url`, `payments.slip_image_url`, etc.) still store the active public URL
- No admin page

## Schema

```sql
CREATE TABLE dbo.media_files (
  media_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  category VARCHAR(32) NOT NULL,              -- avatars|community|slips|hero|cert
  user_id INT NULL,                          -- uploader when known
  original_name NVARCHAR(255) NULL,
  stored_filename NVARCHAR(255) NULL,
  mime_type NVARCHAR(100) NULL,
  file_size_bytes BIGINT NULL,
  local_url NVARCHAR(500) NULL,
  drive_file_id NVARCHAR(128) NULL,
  drive_url NVARCHAR(500) NULL,
  public_url NVARCHAR(500) NOT NULL,
  ref_table NVARCHAR(64) NULL,               -- e.g. users, community_posts, payments
  ref_id NVARCHAR(64) NULL,                  -- string to support non-int keys (filename/slot)
  is_current BIT NOT NULL
    CONSTRAINT DF_media_files_current DEFAULT (1),
  note NVARCHAR(255) NULL,
  created_at DATETIME NOT NULL
    CONSTRAINT DF_media_files_created DEFAULT (GETDATE())
);
CREATE INDEX IX_media_files_category_created ON dbo.media_files (category, created_at DESC);
CREATE INDEX IX_media_files_ref ON dbo.media_files (ref_table, ref_id, category, is_current);
CREATE INDEX IX_media_files_user ON dbo.media_files (user_id, created_at DESC);
```

## Behavior
1. After a successful local save (+ optional Drive upload), call `recordMediaUpload(...)`.
2. If `ref_table` + `ref_id` + `category` are set, set prior matching rows to `is_current = 0`, then insert new row with `is_current = 1`.
3. Update the live URL on the domain table as today (prefer Drive proxy URL when available).
4. Never unlink previous local media for history retention.

## Upload hooks
| Source | category | ref |
|--------|----------|-----|
| Profile avatar | avatars | users / user_id |
| Community post image | community | community_posts / post_id |
| Payment slip | slips | payments / payment_id |
| Hero / home banners | hero | hero / filename |
| Cert logo/stamp | cert | cert / slot key |

## Out of scope
- Admin UI / gallery
- Migrating historical files already on disk into `media_files`
- Changing public URL scheme beyond current Drive-proxy preference

## Verification (SSMS)
```sql
SELECT TOP 50 *
FROM dbo.media_files
ORDER BY created_at DESC;
```
