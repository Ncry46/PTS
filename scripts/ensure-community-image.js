const { connectPool, getPool } = require('../backend/db');

(async () => {
  await connectPool();
  const pool = await getPool();
  await pool.request().query(`
    IF OBJECT_ID('dbo.community_posts','U') IS NOT NULL
       AND COL_LENGTH('dbo.community_posts', 'feeling') IS NULL
    ALTER TABLE dbo.community_posts ADD feeling NVARCHAR(40) NULL
  `);
  await pool.request().query(`
    IF OBJECT_ID('dbo.community_posts','U') IS NOT NULL
       AND COL_LENGTH('dbo.community_posts', 'image_url') IS NULL
    ALTER TABLE dbo.community_posts ADD image_url NVARCHAR(500) NULL
  `);
  const col = await pool.request().query(`
    SELECT
      COL_LENGTH('dbo.community_posts', 'feeling') AS feeling_len,
      COL_LENGTH('dbo.community_posts', 'image_url') AS image_url_len
  `);
  console.log('community_posts columns:', col.recordset[0]);
  process.exit(0);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
