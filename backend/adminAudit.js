const { sql } = require('./db');

async function ensureAdminAuditTable(pool) {
    await pool.request().query(`
        IF OBJECT_ID('dbo.admin_audit_log','U') IS NULL
        CREATE TABLE dbo.admin_audit_log (
            audit_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            admin_id INT NULL,
            admin_name NVARCHAR(200) NULL,
            action NVARCHAR(80) NOT NULL,
            entity NVARCHAR(80) NOT NULL,
            entity_id NVARCHAR(80) NULL,
            detail_json NVARCHAR(MAX) NULL,
            created_at DATETIME NOT NULL CONSTRAINT DF_admin_audit_created DEFAULT (GETDATE())
        )
    `);
}

async function writeAdminAudit(pool, {
    adminId = null,
    adminName = null,
    action,
    entity,
    entityId = null,
    detail = null
} = {}) {
    if (!pool || !action || !entity) return;
    try {
        await ensureAdminAuditTable(pool);
        await pool.request()
            .input('adminId', sql.Int, adminId || null)
            .input('adminName', sql.NVarChar(200), adminName || null)
            .input('action', sql.NVarChar(80), String(action).slice(0, 80))
            .input('entity', sql.NVarChar(80), String(entity).slice(0, 80))
            .input('entityId', sql.NVarChar(80), entityId != null ? String(entityId).slice(0, 80) : null)
            .input('detail', sql.NVarChar(sql.MAX), detail != null ? JSON.stringify(detail) : null)
            .query(`
                INSERT INTO dbo.admin_audit_log (admin_id, admin_name, action, entity, entity_id, detail_json)
                VALUES (@adminId, @adminName, @action, @entity, @entityId, @detail)
            `);
    } catch (err) {
        console.warn('[audit]', err.message);
    }
}

async function listAdminAudit(pool, { limit = 100 } = {}) {
    await ensureAdminAuditTable(pool);
    const top = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const result = await pool.request().query(`
        SELECT TOP (${top})
            audit_id, admin_id, admin_name, action, entity, entity_id, detail_json, created_at
        FROM dbo.admin_audit_log
        ORDER BY created_at DESC, audit_id DESC
    `);
    return result.recordset || [];
}

module.exports = { ensureAdminAuditTable, writeAdminAudit, listAdminAudit };
