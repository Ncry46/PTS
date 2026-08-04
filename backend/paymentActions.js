const sql = require('mssql');
const { syncAfterEnroll } = require('./googleCalendar');
const { createNotification } = require('./ensureSchema');
const { sendEnrollmentConfirmEmail } = require('./emailOtp');

async function ensureEnrolled(pool, userId, courseId) {
    const existing = await pool.request()
        .input('userId', sql.Int, userId)
        .input('courseId', sql.Int, courseId)
        .query(`SELECT enrollment_id FROM BD_PTS.dbo.course_enrollments WHERE user_id = @userId AND course_id = @courseId`);
    return existing.recordset.length > 0;
}

/**
 * Mark payment paid, enroll user, notify + email (best-effort).
 * @param {object} options
 * @param {number|null} [options.reviewedBy] admin user_id when manually approved
 * @param {boolean} [options.notify=true]
 */
async function markPaidAndEnroll(pool, userId, paymentId, courseId, options = {}) {
    const reviewedBy = options.reviewedBy != null ? Number(options.reviewedBy) : null;
    await pool.request()
        .input('paymentId', sql.Int, paymentId)
        .input('reviewedBy', sql.Int, reviewedBy)
        .query(`
            UPDATE BD_PTS.dbo.payments
            SET status = 'paid',
                paid_at = GETDATE(),
                reviewed_at = CASE WHEN @reviewedBy IS NULL THEN reviewed_at ELSE GETDATE() END,
                reviewed_by = CASE WHEN @reviewedBy IS NULL THEN reviewed_by ELSE @reviewedBy END,
                reject_reason = NULL
            WHERE payment_id = @paymentId
        `);

    const enrolled = await ensureEnrolled(pool, userId, courseId);
    if (!enrolled) {
        await pool.request()
            .input('userId', sql.Int, userId)
            .input('courseId', sql.Int, courseId)
            .query(`
                INSERT INTO BD_PTS.dbo.course_enrollments (user_id, course_id, progress_percent, status)
                VALUES (@userId, @courseId, 0, 'in_progress')
            `);
        syncAfterEnroll(pool, userId, courseId).catch(() => {});
    }

    if (options.notify !== false) {
        try {
            const info = await pool.request()
                .input('userId', sql.Int, userId)
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT u.full_name, u.email, c.course_name
                    FROM BD_PTS.dbo.users_main u
                    CROSS JOIN BD_PTS.dbo.courses_main c
                    WHERE u.user_id = @userId AND c.course_id = @courseId
                `);
            const row = info.recordset[0] || {};
            await createNotification(
                pool,
                userId,
                'ลงทะเบียนสำเร็จแล้ว',
                `หลักสูตร ${row.course_name || ''} · รหัส #PTS-${paymentId}`,
                'MyCourses.html'
            );
            if (row.email) {
                sendEnrollmentConfirmEmail(row.email, {
                    fullName: row.full_name,
                    courseName: row.course_name
                }).catch((err) => console.warn('[mail] enrollment confirm:', err.message));
            }
        } catch (err) {
            console.warn('[notify] markPaidAndEnroll:', err.message);
        }
    }

    return { newlyEnrolled: !enrolled };
}

module.exports = { markPaidAndEnroll, ensureEnrolled };
