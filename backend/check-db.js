#!/usr/bin/env node
/**
 * ทดสอบการเชื่อมต่อ SQL Server + ตาราง users / courses
 * ใช้: node backend/check-db.js
 */
const { connectPool, verifyCoreTables, DB_NAME, dbConfig } = require('./db');

(async () => {
    console.log('Testing database connection...');
    console.log(`  server   = ${dbConfig.server}:${dbConfig.port}`);
    console.log(`  database = ${DB_NAME}`);
    try {
        const pool = await connectPool();
        const check = await verifyCoreTables(pool);
        console.log('\nResult:');
        console.log(JSON.stringify(check, null, 2));
        if (!check.users_ok || !check.courses_ok) {
            process.exit(1);
        }
        console.log('\n✅ OK — users + courses tables reachable');
    } catch (err) {
        console.error('\n❌ Connection failed:', err.message);
        process.exit(1);
    }
    process.exit(0);
})();
