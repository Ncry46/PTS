# Media files metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist full upload metadata + history in `dbo.media_files` for every image upload, keep old files, no admin UI.

**Architecture:** Shared helper `backend/mediaFiles.js` ensures the table and records rows; each upload route calls it after local/Drive save. Domain tables keep the active public URL.

**Tech Stack:** Node.js, mssql, existing multer + googleDrive upload paths.

---

### Task 1: Schema + helper

**Files:**
- Create: `backend/mediaFiles.js`
- Modify: `backend/ensureSchema.js` (call ensure from compat path)
- Modify: `backend/server.js` if needed to ensure on boot via compat

- [ ] Add `ensureMediaFilesTable(pool)` + `recordMediaUpload(pool, meta)`
- [ ] Register ensure in `ensureCompatColumns` (always runs)
- [ ] Smoke: start server / run ensure against BD_PTS

### Task 2: Wire uploads + keep old files

**Files:**
- Modify: `backend/profileRoutes.js` (avatar; stop deleting old local avatars)
- Modify: `backend/server.js` (community image)
- Modify: `backend/learningRoutes.js` (slip; stop deleting old local slips)
- Modify: `backend/adminRoutes.js` (hero + cert uploads)

- [ ] Call `recordMediaUpload` after each successful upload
- [ ] Remove local file delete-on-replace for avatars/slips

### Task 3: Docs commit

- [ ] Spec + plan already written
- [ ] Commit and push main
