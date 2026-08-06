const sql = require('mssql');
const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) { /* optional */ }

const DB_NAME = String(process.env.DB_NAME || 'BD_PTS').trim();
const DB_SCHEMA = String(process.env.DB_SCHEMA || 'dbo').trim();
const USERS_TABLE = String(process.env.DB_USERS_TABLE || 'users').trim();
const COURSES_TABLE = String(process.env.DB_COURSES_TABLE || 'courses').trim();

const dbConfig = {
    user: process.env.DB_USER || 'uinet',
    password: process.env.DB_PASSWORD || 'p@$$w0rd',
    server: process.env.DB_SERVER || 'tvsdb2.thanvasupos.com',
    port: Number(process.env.DB_PORT) || 28914,
    database: DB_NAME,
    options: {
        encrypt: process.env.DB_ENCRYPT !== 'false',
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false'
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

/** Qualified table: [DB_NAME].[schema].[table] */
function qualify(table) {
    const t = String(table || '').trim();
    if (!t) throw new Error('qualify(): table name required');
    return `[${DB_NAME}].[${DB_SCHEMA}].[${t}]`;
}

const USERS_SQL = qualify(USERS_TABLE);
const COURSES_SQL = qualify(COURSES_TABLE);

/**
 * Active-row predicate for legacy flag columns.
 * Uses NVARCHAR compare only — never casts varchar 'Y'/'N' to INT
 * (avoids: Conversion failed when converting the varchar value 'N' to data type int).
 * Works for varchar Y/N, bit/int 1/0 (CAST bit→'1'/'0').
 * @param {string} col e.g. 'c.flag_use' or 'flag_use'
 */
function flagActiveSql(col) {
    const c = String(col || 'flag_use').trim();
    return `(
        ${c} IS NULL
        OR UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(20), ${c})))) IN (N'Y', N'YES', N'1', N'TRUE', N'T')
    )`;
}

function flagInactiveSql(col) {
    const c = String(col || 'flag_use').trim();
    return `(
        ${c} IS NOT NULL
        AND UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(20), ${c})))) IN (N'N', N'NO', N'0', N'FALSE', N'F')
    )`;
}

/** JS-side check for API rows (Y/N or 1/0/bit) */
function isFlagActive(value) {
    if (value == null) return true;
    if (value === true || value === 1) return true;
    if (value === false || value === 0) return false;
    const s = String(value).trim().toUpperCase();
    if (!s) return true;
    if (['N', 'NO', '0', 'FALSE', 'F'].includes(s)) return false;
    if (['Y', 'YES', '1', 'TRUE', 'T'].includes(s)) return true;
    const n = Number(s);
    if (!Number.isNaN(n)) return n !== 0;
    return true;
}

function normalizeFlagYn(value, defaultOn = true) {
    if (value === undefined || value === null || value === '') return defaultOn ? 'Y' : 'N';
    return isFlagActive(value) ? 'Y' : 'N';
}

/** Cache: 'numeric' (bit/int) | 'string' (varchar Y/N) */
const flagStorageKindCache = new Map();

/**
 * Detect how flag_use is stored on a table (bit/int vs varchar).
 * @returns {Promise<'numeric'|'string'>}
 */
async function getFlagStorageKind(pool, tableName, column = 'flag_use') {
    const table = String(tableName || '').replace(/^dbo\./i, '').trim();
    const col = String(column || 'flag_use').trim();
    const key = `${table}.${col}`.toLowerCase();
    if (flagStorageKindCache.has(key)) return flagStorageKindCache.get(key);

    try {
        const result = await pool.request()
            .input('table', sql.NVarChar(128), table)
            .input('column', sql.NVarChar(128), col)
            .query(`
                SELECT TYPE_NAME(c.user_type_id) AS type_name
                FROM sys.columns c
                WHERE c.object_id = OBJECT_ID(N'dbo.' + @table)
                  AND c.name = @column
            `);
        const typeName = String(result.recordset[0]?.type_name || '').toLowerCase();
        const kind = ['bit', 'int', 'tinyint', 'smallint', 'bigint', 'decimal', 'numeric'].includes(typeName)
            ? 'numeric'
            : 'string';
        flagStorageKindCache.set(key, kind);
        return kind;
    } catch (_) {
        flagStorageKindCache.set(key, 'string');
        return 'string';
    }
}

/** Bind @flag param with the correct SQL type/value for the target table. */
async function bindFlagInput(pool, request, inputName, tableName, active, column = 'flag_use') {
    const kind = await getFlagStorageKind(pool, tableName, column);
    const on = !!active;
    if (kind === 'numeric') {
        request.input(inputName, sql.Bit, on ? 1 : 0);
    } else {
        request.input(inputName, sql.VarChar(1), on ? 'Y' : 'N');
    }
    return kind;
}

/** SQL literal for INSERT/UPDATE without parameters */
async function flagSqlLiteral(pool, tableName, active, column = 'flag_use') {
    const kind = await getFlagStorageKind(pool, tableName, column);
    if (kind === 'numeric') return active ? '1' : '0';
    return active ? `'Y'` : `'N'`;
}

/**
 * UPDATE dbo.<table> SET flag_use = on/off WHERE <idColumn> = @id
 */
async function setFlagUse(pool, {
    table,
    idColumn,
    idValue,
    active,
    column = 'flag_use',
    extraSet = ''
}) {
    const tableName = String(table || '').replace(/^dbo\./i, '').trim();
    const col = String(column || 'flag_use').trim();
    const idCol = String(idColumn || '').trim();
    const req = pool.request().input('id', sql.Int, idValue);
    await bindFlagInput(pool, req, 'flag', tableName, active, col);
    const extra = extraSet ? `, ${extraSet}` : '';
    return req.query(`
        UPDATE dbo.[${tableName}]
        SET [${col}] = @flag${extra}
        WHERE [${idCol}] = @id
    `);
}

function isAutoSchemaEnabled() {
    const v = String(process.env.DB_AUTO_SCHEMA || '').trim().toLowerCase();
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    return false;
}

async function verifyCoreTables(pool) {
    const out = {
        database: DB_NAME,
        schema: DB_SCHEMA,
        server: dbConfig.server,
        users_table: `${DB_SCHEMA}.${USERS_TABLE}`,
        courses_table: `${DB_SCHEMA}.${COURSES_TABLE}`,
        users_ok: false,
        courses_ok: false,
        users_count: null,
        courses_count: null,
        errors: []
    };

    try {
        const users = await pool.request().query(`SELECT COUNT(*) AS c FROM ${USERS_SQL}`);
        out.users_ok = true;
        out.users_count = Number(users.recordset[0]?.c ?? 0);
    } catch (err) {
        out.errors.push(`${USERS_TABLE}: ${err.message}`);
    }

    try {
        const courses = await pool.request().query(`
            SELECT COUNT(*) AS c
            FROM ${COURSES_SQL}
            WHERE ${flagActiveSql('flag_use')}
        `);
        out.courses_ok = true;
        out.courses_count = Number(courses.recordset[0]?.c ?? 0);
    } catch (err) {
        out.errors.push(`${COURSES_TABLE}: ${err.message}`);
    }

    return out;
}

let poolPromise = null;

function isTransientDbError(err) {
    const msg = String((err && err.message) || err || '');
    const code = String((err && (err.code || err.number)) || '');
    return (
        /ECONNRESET|ESOCKET|ETIMEOUT|ETIMEDOUT|ECONNREFUSED|ConnectionError|Timeout|socket hang up|connect ETIMEDOUT/i.test(msg)
        || /ESOCKET|ETIMEOUT|ECONNRESET|ELOGIN/i.test(code)
    );
}

function connectPool() {
    if (poolPromise) return poolPromise;

    poolPromise = new sql.ConnectionPool(dbConfig)
        .connect()
        .then(async (pool) => {
            console.log(`🔌 Connected to SQL Server → ${dbConfig.server}:${dbConfig.port} / ${DB_NAME}`);
            pool.on('error', (err) => {
                console.error('❌ SQL pool error — จะเชื่อมใหม่รอบถัดไป:', err.message || err);
                try { pool.close(); } catch (_) { /* ignore */ }
                poolPromise = null;
            });
            const check = await verifyCoreTables(pool);
            if (check.users_ok) {
                console.log(`👤 ${USERS_TABLE}: ${check.users_count} รายการ`);
            } else {
                console.warn(`⚠️ ${USERS_TABLE}:`, check.errors.find((e) => e.startsWith(USERS_TABLE)) || 'ไม่พบตาราง');
            }
            if (check.courses_ok) {
                console.log(`📚 ${COURSES_TABLE}: ${check.courses_count} รายการ`);
            } else {
                console.warn(`⚠️ ${COURSES_TABLE}:`, check.errors.find((e) => e.startsWith(COURSES_TABLE)) || 'ไม่พบตาราง');
            }
            pool._ptsDbCheck = check;
            return pool;
        })
        .catch((err) => {
            poolPromise = null;
            throw err;
        });

    return poolPromise;
}

/** ดึง pool พร้อม retry เมื่อสาย DB หลุดชั่วคราว */
async function getPool(retries = 1) {
    let lastErr = null;
    for (let i = 0; i <= retries; i += 1) {
        try {
            return await connectPool();
        } catch (err) {
            lastErr = err;
            poolPromise = null;
            if (i >= retries || !isTransientDbError(err)) throw err;
            await new Promise((r) => setTimeout(r, 300 * (i + 1)));
        }
    }
    throw lastErr;
}

/**
 * รันงานกับ DB พร้อม retry 1 ครั้งเมื่อ connection หลุดกลางคัน
 * @template T
 * @param {(pool: import('mssql').ConnectionPool) => Promise<T>} fn
 */
async function withDb(fn) {
    try {
        const pool = await getPool(1);
        return await fn(pool);
    } catch (err) {
        if (!isTransientDbError(err)) throw err;
        poolPromise = null;
        const pool = await getPool(1);
        return fn(pool);
    }
}

module.exports = {
    sql,
    dbConfig,
    DB_NAME,
    DB_SCHEMA,
    USERS_TABLE,
    COURSES_TABLE,
    USERS_SQL,
    COURSES_SQL,
    qualify,
    flagActiveSql,
    flagInactiveSql,
    isFlagActive,
    normalizeFlagYn,
    isAutoSchemaEnabled,
    verifyCoreTables,
    connectPool,
    getPool,
    withDb,
    isTransientDbError,
    getFlagStorageKind,
    bindFlagInput,
    flagSqlLiteral,
    setFlagUse,
    get poolPromise() {
        return connectPool();
    }
};
