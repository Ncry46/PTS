const { connectPool, getPool } = require('../backend/db');

(async () => {
  await connectPool();
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.community_posts','U') IS NOT NULL
       AND COL_LENGTH('dbo.community_posts', 'feeling') IS NULL
    ALTER TABLE dbo.community_posts ADD feeling NVARCHAR(40) NULL
  `);
  const col = await pool.request().query(`
    SELECT COL_LENGTH('dbo.community_posts', 'feeling') AS feeling_len
  `);
  console.log('feeling column:', col.recordset[0]);
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
