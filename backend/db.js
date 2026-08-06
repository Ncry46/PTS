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
 * Supports varchar Y/N and bit/int 1/0 without conversion errors.
 * @param {string} col e.g. 'c.flag_use' or 'flag_use'
 */
function flagActiveSql(col) {
    const c = String(col || 'flag_use').trim();
    return `(
        ${c} IS NULL
        OR TRY_CAST(${c} AS INT) = 1
        OR UPPER(LTRIM(RTRIM(CAST(${c} AS NVARCHAR(20))))) IN (N'Y', N'YES', N'1', N'TRUE', N'T')
    )`;
}

function flagInactiveSql(col) {
    const c = String(col || 'flag_use').trim();
    return `(
        ${c} IS NOT NULL
        AND (
            TRY_CAST(${c} AS INT) = 0
            OR UPPER(LTRIM(RTRIM(CAST(${c} AS NVARCHAR(20))))) IN (N'N', N'NO', N'0', N'FALSE', N'F')
        )
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

function connectPool() {
    if (poolPromise) return poolPromise;

    poolPromise = new sql.ConnectionPool(dbConfig)
        .connect()
        .then(async (pool) => {
            console.log(`🔌 Connected to SQL Server → ${dbConfig.server}:${dbConfig.port} / ${DB_NAME}`);
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
    getPool: connectPool,
    get poolPromise() {
        return connectPool();
    }
};
