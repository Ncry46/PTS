const express = require('express');
const { flagActiveSql, setFlagUse, bindFlagInput } = require('./db');
const sql = require('mssql');

async function ensureCourseReviewsTable(pool) {
    await pool.request().query(`
        IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'course_reviews')
        CREATE TABLE dbo.course_reviews (
            review_id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
            course_id INT NOT NULL,
            user_id INT NOT NULL,
            rating TINYINT NOT NULL,
            comment NVARCHAR(1000) NULL,
            created_at DATETIME NOT NULL CONSTRAINT DF_course_reviews_created DEFAULT (GETDATE()),
            updated_at DATETIME NOT NULL CONSTRAINT DF_course_reviews_updated DEFAULT (GETDATE()),
            flag_use BIT NOT NULL CONSTRAINT DF_course_reviews_flag DEFAULT (1),
            CONSTRAINT CK_course_reviews_rating CHECK (rating BETWEEN 1 AND 5),
            CONSTRAINT UQ_course_reviews_user_course UNIQUE (course_id, user_id)
        )
    `);
}

async function isEnrolled(pool, userId, courseId) {
    const r = await pool.request()
        .input('userId', sql.Int, userId)
        .input('courseId', sql.Int, courseId)
        .query(`
            SELECT TOP 1 enrollment_id
            FROM dbo.course_enrollments
            WHERE user_id = @userId AND course_id = @courseId
        `);
    return r.recordset.length > 0;
}

async function hasPaid(pool, userId, courseId) {
    const r = await pool.request()
        .input('userId', sql.Int, userId)
        .input('courseId', sql.Int, courseId)
        .query(`
            SELECT TOP 1 payment_id
            FROM dbo.payments
            WHERE user_id = @userId AND course_id = @courseId AND status = 'paid'
        `);
    return r.recordset.length > 0;
}

/** Eligible after enroll + paid + course progress completed (~100%) */
async function canReviewCourse(pool, userId, courseId) {
    if (!userId || !courseId) {
        return { ok: false, enrolled: false, paid: false, completed: false, reason: 'กรุณาเข้าสู่ระบบก่อน' };
    }
    const enrolled = await isEnrolled(pool, userId, courseId);
    const paid = await hasPaid(pool, userId, courseId);
    if (!enrolled) {
        return { ok: false, enrolled, paid, completed: false, reason: 'ต้องสมัครเรียนหลักสูตรนี้ก่อนจึงจะรีวิวได้' };
    }
    if (!paid) {
        return { ok: false, enrolled, paid, completed: false, reason: 'ต้องชำระเงินเรียบร้อยแล้วจึงจะรีวิวได้' };
    }
    let progress = 0;
    let status = '';
    try {
        const prog = await pool.request()
            .input('userId', sql.Int, userId)
            .input('courseId', sql.Int, courseId)
            .query(`
                SELECT TOP 1 progress_percent, status
                FROM dbo.course_enrollments
                WHERE user_id = @userId AND course_id = @courseId
            `);
        progress = Number(prog.recordset[0]?.progress_percent || 0);
        status = String(prog.recordset[0]?.status || '').toLowerCase();
    } catch (_) { /* ignore */ }
    const completed = progress >= 100 || status === 'completed' || status === 'complete';
    if (!completed) {
        return {
            ok: false,
            enrolled,
            paid,
            completed: false,
            reason: 'เรียนให้ครบ 100% ก่อนจึงจะรีวิวได้'
        };
    }
    return { ok: true, enrolled, paid, completed: true, reason: null };
}

async function refreshCourseRating(pool, courseId) {
    await pool.request()
        .input('courseId', sql.Int, courseId)
        .query(`
            UPDATE dbo.courses
            SET
                average_rating = ISNULL((
                    SELECT CAST(AVG(CAST(rating AS DECIMAL(10,2))) AS DECIMAL(4,2))
                    FROM dbo.course_reviews
                    WHERE course_id = @courseId AND ${flagActiveSql('flag_use')}
                ), 0),
                total_reviews = ISNULL((
                    SELECT COUNT(*)
                    FROM dbo.course_reviews
                    WHERE course_id = @courseId AND ${flagActiveSql('flag_use')}
                ), 0)
            WHERE course_id = @courseId
        `);
}

function mapReview(row) {
    return {
        review_id: row.review_id,
        course_id: row.course_id,
        user_id: row.user_id,
        rating: Number(row.rating),
        comment: row.comment || '',
        created_at: row.created_at,
        updated_at: row.updated_at,
        full_name: row.username || row.full_name || 'ผู้เรียน',
        avatar_url: row.Url || row.avatar_url || null
    };
}

function createReviewRouter({ poolPromise, requireLogin }) {
    const router = express.Router();

    router.get('/courses/:courseId/reviews', async (req, res) => {
        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            await ensureCourseReviewsTable(pool);
            const userId = req.session?.user?.user_id || null;

            const list = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT TOP 100
                        r.review_id, r.course_id, r.user_id, r.rating, r.comment,
                        r.created_at, r.updated_at, u.username, u.Url
                    FROM dbo.course_reviews r
                    INNER JOIN dbo.users u ON u.user_id = r.user_id
                    WHERE r.course_id = @courseId AND ${flagActiveSql('r.flag_use')}
                    ORDER BY r.updated_at DESC, r.review_id DESC
                `);

            const stats = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`
                    SELECT
                        COUNT(*) AS total_reviews,
                        ISNULL(AVG(CAST(rating AS DECIMAL(10,2))), 0) AS average_rating
                    FROM dbo.course_reviews
                    WHERE course_id = @courseId AND ${flagActiveSql('flag_use')}
                `);

            let my_review = null;
            let can_review = false;
            let can_review_reason = 'กรุณาเข้าสู่ระบบก่อน';
            if (userId) {
                const eligibility = await canReviewCourse(pool, userId, courseId);
                can_review = eligibility.ok;
                can_review_reason = eligibility.reason;
                const mine = await pool.request()
                    .input('courseId', sql.Int, courseId)
                    .input('userId', sql.Int, userId)
                    .query(`
                        SELECT TOP 1
                            r.review_id, r.course_id, r.user_id, r.rating, r.comment,
                            r.created_at, r.updated_at, u.username, u.Url
                        FROM dbo.course_reviews r
                        INNER JOIN dbo.users u ON u.user_id = r.user_id
                        WHERE r.course_id = @courseId AND r.user_id = @userId AND ${flagActiveSql('r.flag_use')}
                    `);
                if (mine.recordset[0]) my_review = mapReview(mine.recordset[0]);
            }

            const s = stats.recordset[0] || {};
            res.json({
                success: true,
                data: (list.recordset || []).map(mapReview),
                summary: {
                    total_reviews: Number(s.total_reviews || 0),
                    average_rating: Number(Number(s.average_rating || 0).toFixed(1))
                },
                can_review,
                can_review_reason,
                my_review
            });
        } catch (error) {
            console.error('[reviews] list:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/courses/:courseId/reviews', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });

        const rating = parseInt(req.body?.rating, 10);
        const comment = String(req.body?.comment || '').trim().slice(0, 1000);
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ success: false, message: 'กรุณาให้คะแนน 1–5 ดาว' });
        }

        try {
            const pool = await poolPromise;
            await ensureCourseReviewsTable(pool);

            const eligibility = await canReviewCourse(pool, user.user_id, courseId);
            if (!eligibility.ok) {
                return res.status(403).json({ success: false, message: eligibility.reason });
            }

            const courseOk = await pool.request()
                .input('courseId', sql.Int, courseId)
                .query(`SELECT course_id FROM dbo.courses WHERE course_id = @courseId`);
            if (!courseOk.recordset.length) {
                return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตร' });
            }

            const existing = await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT TOP 1 review_id
                    FROM dbo.course_reviews
                    WHERE course_id = @courseId AND user_id = @userId
                `);

            let reviewId;
            if (existing.recordset[0]) {
                reviewId = existing.recordset[0].review_id;
                await pool.request()
                    .input('reviewId', sql.Int, reviewId)
                    .input('rating', sql.TinyInt, rating)
                    .input('comment', sql.NVarChar, comment || null)
                    .query(`
                        UPDATE dbo.course_reviews
                        SET rating = @rating,
                            comment = @comment,
                            updated_at = GETDATE(),
                            flag_use = 1
                        WHERE review_id = @reviewId
                    `);
            } else {
                const inserted = await pool.request()
                    .input('courseId', sql.Int, courseId)
                    .input('userId', sql.Int, user.user_id)
                    .input('rating', sql.TinyInt, rating)
                    .input('comment', sql.NVarChar, comment || null)
                    .query(`
                        INSERT INTO dbo.course_reviews (course_id, user_id, rating, comment, flag_use)
                        OUTPUT INSERTED.review_id
                        VALUES (@courseId, @userId, @rating, @comment, 1)
                    `);
                reviewId = inserted.recordset[0].review_id;
            }

            await refreshCourseRating(pool, courseId);

            const saved = await pool.request()
                .input('reviewId', sql.Int, reviewId)
                .query(`
                    SELECT r.review_id, r.course_id, r.user_id, r.rating, r.comment,
                           r.created_at, r.updated_at, u.username, u.Url
                    FROM dbo.course_reviews r
                    INNER JOIN dbo.users u ON u.user_id = r.user_id
                    WHERE r.review_id = @reviewId
                `);

            res.json({
                success: true,
                message: existing.recordset[0] ? 'อัปเดตรีวิวแล้ว' : 'ส่งรีวิวสำเร็จ ขอบคุณสำหรับความคิดเห็น',
                data: mapReview(saved.recordset[0])
            });
        } catch (error) {
            console.error('[reviews] save:', error.message);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.delete('/courses/:courseId/reviews/me', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const courseId = parseInt(req.params.courseId, 10);
        if (!courseId) return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });
        try {
            const pool = await poolPromise;
            await ensureCourseReviewsTable(pool);
            const result = await pool.request()
                .input('courseId', sql.Int, courseId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    UPDATE dbo.course_reviews
                    SET flag_use = 0, updated_at = GETDATE()
                    WHERE course_id = @courseId AND user_id = @userId AND ${flagActiveSql('flag_use')}
                `);
            if (!result.rowsAffected?.[0]) {
                return res.status(404).json({ success: false, message: 'ไม่พบรีวิวของคุณ' });
            }
            await refreshCourseRating(pool, courseId);
            res.json({ success: true, message: 'ลบรีวิวแล้ว' });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = {
    createReviewRouter,
    ensureCourseReviewsTable,
    canReviewCourse,
    refreshCourseRating
};
