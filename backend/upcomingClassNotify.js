/**
 * Notify enrolled learners about class schedules starting within the next ~24 hours.
 * Safe to call repeatedly (dedupes via recent notifications with same title+body prefix).
 */
const { flagActiveSql } = require('./db');
const { createNotification } = require('./ensureSchema');

async function notifyUpcomingClasses(pool) {
    if (!pool) return { notified: 0 };
    let rows = [];
    try {
        const result = await pool.request().query(`
            SELECT
                e.user_id,
                s.schedule_id,
                s.start_at,
                s.section_title,
                COALESCE(NULLIF(LTRIM(RTRIM(c.course_name_th)), N''), NULLIF(LTRIM(RTRIM(c.course_name_en)), N''), N'หลักสูตร') AS course_name
            FROM dbo.class_schedules s
            INNER JOIN dbo.course_enrollments e ON e.course_id = s.course_id
            LEFT JOIN dbo.courses c ON c.course_id = s.course_id
            WHERE ${flagActiveSql('s.flag_use')}
              AND s.course_id IS NOT NULL
              AND s.start_at IS NOT NULL
              AND s.start_at >= GETDATE()
              AND s.start_at < DATEADD(HOUR, 24, GETDATE())
        `);
        rows = result.recordset || [];
    } catch (err) {
        console.warn('[notify-upcoming]', err.message);
        return { notified: 0, error: err.message };
    }

    let notified = 0;
    for (const row of rows) {
        const title = 'คลาสใกล้เริ่มแล้ว';
        const when = row.start_at ? new Date(row.start_at).toLocaleString('th-TH') : '';
        const body = `${row.course_name || ''}${row.section_title ? ' · ' + row.section_title : ''} · ${when}`.trim();
        try {
            const exists = await pool.request()
                .input('userId', sql.Int, row.user_id)
                .input('marker', sql.NVarChar, `#S${row.schedule_id}`)
                .query(`
                    SELECT TOP 1 notification_id
                    FROM dbo.notifications
                    WHERE user_id = @userId
                      AND body LIKE N'%' + @marker + N'%'
                      AND created_at > DATEADD(HOUR, -36, GETDATE())
                `);
            if (exists.recordset && exists.recordset.length) continue;
            await createNotification(pool, row.user_id, title, `${body} · #S${row.schedule_id}`, 'Schedule.html');
            notified += 1;
        } catch (err) {
            console.warn('[notify-upcoming] row', row.schedule_id, err.message);
        }
    }
    return { notified };
}

function startUpcomingClassNotifier(getPool, intervalMs = 30 * 60 * 1000) {
    const run = async () => {
        try {
            const pool = typeof getPool === 'function' ? await getPool() : getPool;
            if (!pool) return;
            const result = await notifyUpcomingClasses(pool);
            if (result.notified) console.log(`🔔 Upcoming class notifications: ${result.notified}`);
        } catch (err) {
            console.warn('[notify-upcoming] tick:', err.message);
        }
    };
    setTimeout(run, 15 * 1000);
    setInterval(run, intervalMs);
}

module.exports = { notifyUpcomingClasses, startUpcomingClassNotifier };
