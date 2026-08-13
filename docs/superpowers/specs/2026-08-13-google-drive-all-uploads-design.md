# Google Drive uploads — all images in typed subfolders

Date: 2026-08-13

## Goal
Upload every PTS image to Google Drive under the existing root `GOOGLE_DRIVE_FOLDER_ID`, organized into auto-created subfolders by source. Keep local `uploads/` copies so existing URLs and admin previews keep working.

## Approach
**A — Auto subfolders** under the root Drive folder.

| Category   | Folder name  | Sources |
|------------|--------------|---------|
| avatars    | `avatars`    | Profile photo |
| slips      | `slips`      | Payment slip |
| community  | `community`  | Community post images |
| hero       | `hero`       | Home / gallery / admin banners |
| cert       | `cert`       | Certificate logo / stamp |

## Behavior
1. On first upload of a category, find-or-create the named subfolder under the root folder; cache folder IDs in memory (+ optional local cache file).
2. `tryUploadLocalFile(..., { category })` uploads into that subfolder.
3. Local disk write remains; Drive is a structured backup (same pattern as slips today).
4. If Drive is not configured or upload fails, continue with local-only (warn in logs).
5. No bulk migration of historical files in this change.

## Out of scope
- Changing public URLs to Drive-only
- Migrating old local-only files
- Per-user Drive folders
