const sql = require('mssql');

const USAGE_RULES = new Set(['once', 'max_uses', 'once_per_user']);

function normalizeCouponCode(raw) {
    return String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
}

function parseDiscountAmount(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return null;
    return Math.round(n * 100) / 100;
}

/**
 * Load coupon + course price and validate eligibility for a user (optional).
 * Does not mutate used_count.
 */
async function loadValidCoupon(pool, { code, courseId, userId = null }) {
    const normalized = normalizeCouponCode(code);
    if (!normalized) {
        return { ok: false, status: 400, message: 'กรุณากรอกรหัสคูปอง' };
    }
    if (!courseId) {
        return { ok: false, status: 400, message: 'ไม่พบหลักสูตร' };
    }

    const result = await pool.request()
        .input('code', sql.VarChar(64), normalized)
        .input('courseId', sql.Int, courseId)
        .query(`
            SELECT
                c.coupon_id, c.code, c.course_id, c.discount_amount, c.usage_rule,
                c.max_uses, c.used_count, c.expires_at, c.flag_use, c.note,
                ISNULL(co.price, 0) AS course_price,
                COALESCE(
                    NULLIF(LTRIM(RTRIM(co.course_name_th)), N''),
                    NULLIF(LTRIM(RTRIM(co.course_name_en)), N'')
                ) AS course_name
            FROM dbo.coupons c
            INNER JOIN dbo.courses co ON co.course_id = c.course_id
            WHERE c.code = @code AND c.course_id = @courseId
        `);

    if (!result.recordset.length) {
        return { ok: false, status: 404, message: 'ไม่พบคูปองสำหรับหลักสูตรนี้' };
    }

    const row = result.recordset[0];
    if (!row.flag_use) {
        return { ok: false, status: 400, message: 'คูปองนี้ถูกปิดใช้งานแล้ว' };
    }
    if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false, status: 400, message: 'คูปองหมดอายุแล้ว' };
    }

    const coursePrice = Number(row.course_price) || 0;
    let discount = Number(row.discount_amount) || 0;
    if (discount < 0) discount = 0;
    if (discount > coursePrice) discount = coursePrice;

    const rule = String(row.usage_rule || 'max_uses');
    const usedCount = Number(row.used_count) || 0;
    const maxUses = row.max_uses == null ? null : Number(row.max_uses);

    if (rule === 'once' && usedCount >= 1) {
        return { ok: false, status: 400, message: 'คูปองนี้ถูกใช้ไปแล้ว' };
    }
    if (rule === 'max_uses' && maxUses != null && usedCount >= maxUses) {
        return { ok: false, status: 400, message: 'คูปองนี้ถูกใช้ครบจำนวนแล้ว' };
    }

    if (rule === 'once_per_user' && userId) {
        const prior = await pool.request()
            .input('couponId', sql.Int, row.coupon_id)
            .input('userId', sql.Int, userId)
            .query(`
                SELECT TOP 1 redemption_id
                FROM dbo.coupon_redemptions
                WHERE coupon_id = @couponId AND user_id = @userId
            `);
        if (prior.recordset.length) {
            return { ok: false, status: 400, message: 'คุณใช้คูปองนี้ไปแล้ว' };
        }
        if (maxUses != null && usedCount >= maxUses) {
            return { ok: false, status: 400, message: 'คูปองนี้ถูกใช้ครบจำนวนแล้ว' };
        }
    }

    const finalAmount = Math.max(0, Math.round((coursePrice - discount) * 100) / 100);

    return {
        ok: true,
        coupon: row,
        coursePrice,
        discount,
        finalAmount,
        courseName: row.course_name || ''
    };
}

async function recordRedemption(pool, {
    couponId,
    userId,
    paymentId = null,
    courseId,
    discountApplied
}) {
    await pool.request()
        .input('couponId', sql.Int, couponId)
        .input('userId', sql.Int, userId)
        .input('paymentId', sql.Int, paymentId)
        .input('courseId', sql.Int, courseId)
        .input('discount', sql.Decimal(10, 2), discountApplied)
        .query(`
            INSERT INTO dbo.coupon_redemptions
                (coupon_id, user_id, payment_id, course_id, discount_applied)
            VALUES (@couponId, @userId, @paymentId, @courseId, @discount)
        `);

    await pool.request()
        .input('couponId', sql.Int, couponId)
        .query(`
            UPDATE dbo.coupons
            SET used_count = ISNULL(used_count, 0) + 1
            WHERE coupon_id = @couponId
        `);
}

module.exports = {
    USAGE_RULES,
    normalizeCouponCode,
    parseDiscountAmount,
    loadValidCoupon,
    recordRedemption
};
