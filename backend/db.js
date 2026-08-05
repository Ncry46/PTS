const sql = require('mssql');
const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) { /* optional */ }

const DB_NAME = String(process.env.DB_NAME || 'BD_PTS').trim();
const DB_SCHEMA = String(process.env.DB_SCHEMA || 'dbo').trim();

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

function isAutoSchemaEnabled() {
    const v = String(process.env.DB_AUTO_SCHEMA || '').trim().toLowerCase();
    if (v === '0' || v === 'false' || v === 'no' || v === 'off') return false;
    if (v === '1' || v === 'true' || v === 'yes' || v === 'on') return true;
    // default: connect-only (ใช้ DB ที่มีอยู่แล้ว ไม่สร้างตาราง)
    return false;
}

async function verifyCoreTables(pool) {
    const out = {
        database: DB_NAME,
        schema: DB_SCHEMA,
        server: dbConfig.server,
        users_table: `${DB_SCHEMA}.users`,
        courses_table: `${DB_SCHEMA}.courses`,
        users_ok: false,
        courses_ok: false,
        users_count: null,
        courses_count: null,
        errors: []
    };

    try {
        const users = await pool.request().query(`
            SELECT COUNT(*) AS c FROM ${qualify('users')}
        `);
        out.users_ok = true;
        out.users_count = Number(users.recordset[0]?.c ?? 0);
    } catch (err) {
        out.errors.push(`users: ${err.message}`);
    }

    try {
        const courses = await pool.request().query(`
            SELECT COUNT(*) AS c
            FROM ${qualify('courses')}
            WHERE ISNULL(flag_use, 'Y') = 'Y'
        `);
        out.courses_ok = true;
        out.courses_count = Number(courses.recordset[0]?.c ?? 0);
    } catch (err) {
        out.errors.push(`courses: ${err.message}`);
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
                console.log(`👤 users: ${check.users_count} รายการ`);
            } else {
                console.warn('⚠️ users:', check.errors.find((e) => e.startsWith('users')) || 'ไม่พบตาราง');
            }
            if (check.courses_ok) {
                console.log(`📚 courses: ${check.courses_count} รายการ`);
            } else {
                console.warn('⚠️ courses:', check.errors.find((e) => e.startsWith('courses')) || 'ไม่พบตาราง');
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
    qualify,
    isAutoSchemaEnabled,
    verifyCoreTables,
    connectPool,
    get poolPromise() {
        return connectPool();
    }
};
