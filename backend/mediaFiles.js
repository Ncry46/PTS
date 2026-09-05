/**
 * Central upload metadata / history for PTS images.
 * Table: dbo.media_files — inspect in SSMS (no admin UI).
 */
const sql = require('mssql');

const CATEGORIES = new Set(['avatars', 'community', 'slips', 'hero', 'cert', 'covers']);

async function ensureMediaFilesTable(pool) {
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'media_files' AND schema_id = SCHEMA_ID('dbo'))
        CREATE TABLE dbo.media_files (
            media_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            category VARCHAR(32) NOT NULL,
            user_id INT NULL,
            original_name NVARCHAR(255) NULL,
            stored_filename NVARCHAR(255) NULL,
            mime_type NVARCHAR(100) NULL,
            file_size_bytes BIGINT NULL,
            local_url NVARCHAR(500) NULL,
            drive_file_id NVARCHAR(128) NULL,
            drive_url NVARCHAR(500) NULL,
            public_url NVARCHAR(500) NOT NULL,
            ref_table NVARCHAR(64) NULL,
            ref_id NVARCHAR(64) NULL,
            is_current BIT NOT NULL CONSTRAINT DF_media_files_current DEFAULT (1),
            note NVARCHAR(255) NULL,
            created_at DATETIME NOT NULL CONSTRAINT DF_media_files_created DEFAULT (GETDATE())
        )
    `);

    await pool.request().query(`
        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = 'IX_media_files_category_created' AND object_id = OBJECT_ID('dbo.media_files')
        )
        CREATE INDEX IX_media_files_category_created
            ON dbo.media_files (category, created_at DESC)
    `);

    await pool.request().query(`
        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = 'IX_media_files_ref' AND object_id = OBJECT_ID('dbo.media_files')
        )
        CREATE INDEX IX_media_files_ref
            ON dbo.media_files (ref_table, ref_id, category, is_current)
    `);

    await pool.request().query(`
        IF NOT EXISTS (
            SELECT 1 FROM sys.indexes
            WHERE name = 'IX_media_files_user' AND object_id = OBJECT_ID('dbo.media_files')
        )
        CREATE INDEX IX_media_files_user
            ON dbo.media_files (user_id, created_at DESC)
    `);
}

/**
 * Insert a media history row. Marks prior current rows for the same
 * (category, ref_table, ref_id) as is_current = 0 when refs are provided.
 *
 * @returns {Promise<{ media_id: number|null, ok: boolean, error?: string }>}
 */
async function recordMediaUpload(pool, meta = {}) {
    try {
        await ensureMediaFilesTable(pool);

        const category = String(meta.category || '').trim().toLowerCase();
        if (!CATEGORIES.has(category)) {
            return { ok: false, media_id: null, error: `invalid category: ${category}` };
        }

        const publicUrl = String(meta.publicUrl || meta.driveUrl || meta.localUrl || '').trim();
        if (!publicUrl) {
            return { ok: false, media_id: null, error: 'publicUrl required' };
        }

        const refTable = meta.refTable != null ? String(meta.refTable).trim() : null;
        const refId = meta.refId != null && meta.refId !== '' ? String(meta.refId).trim() : null;
        const markCurrent = meta.markCurrent !== false;

        if (markCurrent && refTable && refId) {
            await pool.request()
                .input('category', sql.VarChar(32), category)
                .input('refTable', sql.NVarChar(64), refTable)
                .input('refId', sql.NVarChar(64), refId)
                .query(`
                    UPDATE dbo.media_files
                    SET is_current = 0
                    WHERE category = @category
                      AND ref_table = @refTable
                      AND ref_id = @refId
                      AND is_current = 1
                `);
        }

        const result = await pool.request()
            .input('category', sql.VarChar(32), category)
            .input('userId', sql.Int, meta.userId != null ? Number(meta.userId) : null)
            .input('originalName', sql.NVarChar(255), meta.originalName || null)
            .input('storedFilename', sql.NVarChar(255), meta.storedFilename || null)
            .input('mimeType', sql.NVarChar(100), meta.mimeType || null)
            .input('fileSizeBytes', sql.BigInt, meta.fileSizeBytes != null ? Number(meta.fileSizeBytes) : null)
            .input('localUrl', sql.NVarChar(500), meta.localUrl || null)
            .input('driveFileId', sql.NVarChar(128), meta.driveFileId || null)
            .input('driveUrl', sql.NVarChar(500), meta.driveUrl || null)
            .input('publicUrl', sql.NVarChar(500), publicUrl)
            .input('refTable', sql.NVarChar(64), refTable)
            .input('refId', sql.NVarChar(64), refId)
            .input('isCurrent', sql.Bit, markCurrent ? 1 : 0)
            .input('note', sql.NVarChar(255), meta.note || null)
            .query(`
                INSERT INTO dbo.media_files (
                    category, user_id, original_name, stored_filename, mime_type, file_size_bytes,
                    local_url, drive_file_id, drive_url, public_url,
                    ref_table, ref_id, is_current, note, created_at
                )
                OUTPUT INSERTED.media_id
                VALUES (
                    @category, @userId, @originalName, @storedFilename, @mimeType, @fileSizeBytes,
                    @localUrl, @driveFileId, @driveUrl, @publicUrl,
                    @refTable, @refId, @isCurrent, @note, GETDATE()
                )
            `);

        const mediaId = result.recordset[0]?.media_id || null;
        return { ok: true, media_id: mediaId };
    } catch (err) {
        console.warn('[media_files] record failed:', err.message);
        return { ok: false, media_id: null, error: err.message };
    }
}

module.exports = {
    CATEGORIES,
    ensureMediaFilesTable,
    recordMediaUpload
};
