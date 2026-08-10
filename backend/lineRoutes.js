/**
 * LINE Official Account routes:
 * - status / OA add-friend
 * - LIFF config + account link/unlink
 * - webhook (follow / menu messages)
 */
const express = require('express');
const sql = require('mssql');
const line = require('./lineMessaging');
const { createNotification } = require('./ensureSchema');

function createLineRouter({ poolPromise, requireLogin }) {
    const router = express.Router();

    /** Public: add-friend + LIFF readiness (used by Settings + LineApp). */
    router.get('/line/oa', (_req, res) => {
        const st = line.publicLineStatus();
        return res.json({
            success: true,
            configured: st.addFriendConfigured || st.liffConfigured || st.messagingConfigured,
            url: st.addFriendUrl,
            name: st.name,
            ...st
        });
    });

    router.get('/line/status', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const pool = await poolPromise;
            const link = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT line_user_id, display_name, picture_url, linked_at, notify_enabled
                    FROM dbo.line_account_links
                    WHERE user_id = @userId
                `);
            const row = link.recordset[0] || null;
            const st = line.publicLineStatus();
            return res.json({
                success: true,
                ...st,
                linked: Boolean(row),
                notifyEnabled: row ? Number(row.notify_enabled) === 1 : false,
                profile: row ? {
                    lineUserId: row.line_user_id,
                    displayName: row.display_name || null,
                    pictureUrl: row.picture_url || null,
                    linkedAt: row.linked_at
                } : null
            });
        } catch (error) {
            console.error('[line/status]', error.message);
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/line/liff-config', (_req, res) => {
        const st = line.publicLineStatus();
        return res.json({
            success: true,
            liffId: st.liffId,
            liffConfigured: st.liffConfigured,
            name: st.name,
            addFriendUrl: st.addFriendUrl,
            appUrl: st.appUrl
        });
    });

    /** Link LINE identity to logged-in PTS user (from LIFF). */
    router.post('/line/link', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const idToken = String(req.body?.idToken || req.body?.id_token || '').trim();
            const accessToken = String(req.body?.accessToken || req.body?.access_token || '').trim();

            let lineUserId = '';
            let displayName = null;
            let pictureUrl = null;

            if (idToken && line.getChannelId()) {
                const verified = await line.verifyIdToken(idToken);
                lineUserId = String(verified.sub || '').trim();
                displayName = verified.name || null;
                pictureUrl = verified.picture || null;
            } else if (accessToken) {
                const profile = await line.fetchProfileByAccessToken(accessToken);
                lineUserId = String(profile.userId || '').trim();
                displayName = profile.displayName || null;
                pictureUrl = profile.pictureUrl || null;
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'ส่ง idToken จาก LIFF หรือ accessToken ของ LINE'
                });
            }

            if (!lineUserId) {
                return res.status(400).json({ success: false, message: 'ไม่พบ LINE user id' });
            }

            const pool = await poolPromise;

            const taken = await pool.request()
                .input('lineUserId', sql.NVarChar, lineUserId)
                .input('userId', sql.Int, user.user_id)
                .query(`
                    SELECT user_id FROM dbo.line_account_links
                    WHERE line_user_id = @lineUserId AND user_id <> @userId
                `);
            if (taken.recordset.length) {
                return res.status(409).json({
                    success: false,
                    message: 'บัญชี LINE นี้ถูกเชื่อมกับผู้ใช้อื่นแล้ว'
                });
            }

            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('lineUserId', sql.NVarChar, lineUserId)
                .input('displayName', sql.NVarChar, displayName)
                .input('pictureUrl', sql.NVarChar, pictureUrl)
                .query(`
                    MERGE dbo.line_account_links AS t
                    USING (SELECT @userId AS user_id) AS s
                    ON t.user_id = s.user_id
                    WHEN MATCHED THEN UPDATE SET
                        line_user_id = @lineUserId,
                        display_name = @displayName,
                        picture_url = @pictureUrl,
                        linked_at = GETDATE(),
                        updated_at = GETDATE(),
                        notify_enabled = 1
                    WHEN NOT MATCHED THEN INSERT
                        (user_id, line_user_id, display_name, picture_url, notify_enabled)
                    VALUES
                        (@userId, @lineUserId, @displayName, @pictureUrl, 1);
                `);

            try {
                await createNotification(
                    pool,
                    user.user_id,
                    'เชื่อม LINE OA แล้ว',
                    'รับแจ้งเตือนและเปิดเมนูด่วนใน LINE ได้เลย',
                    'LineApp.html'
                );
            } catch (_) { /* ignore */ }

            if (line.isMessagingConfigured()) {
                try {
                    await line.pushMessage(lineUserId, [line.buildMenuFlex()]);
                } catch (pushErr) {
                    console.warn('[line/link] push menu:', pushErr.message);
                }
            }

            return res.json({
                success: true,
                message: 'เชื่อม LINE สำเร็จ',
                linked: true,
                profile: { lineUserId, displayName, pictureUrl }
            });
        } catch (error) {
            console.error('[line/link]', error.message);
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/line/unlink', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const pool = await poolPromise;
            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .query(`DELETE FROM dbo.line_account_links WHERE user_id = @userId`);
            return res.json({ success: true, message: 'ยกเลิกการเชื่อม LINE แล้ว', linked: false });
        } catch (error) {
            console.error('[line/unlink]', error.message);
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/line/notify-pref', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            const enabled = req.body?.enabled !== false && req.body?.enabled !== 0 && req.body?.enabled !== '0';
            const pool = await poolPromise;
            const result = await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('enabled', sql.Bit, enabled ? 1 : 0)
                .query(`
                    UPDATE dbo.line_account_links
                    SET notify_enabled = @enabled, updated_at = GETDATE()
                    WHERE user_id = @userId;
                    SELECT @@ROWCOUNT AS affected;
                `);
            if (!result.recordset[0]?.affected) {
                return res.status(404).json({ success: false, message: 'ยังไม่ได้เชื่อมบัญชี LINE' });
            }
            return res.json({ success: true, notifyEnabled: enabled });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    /** Push the polished home Flex to the linked LINE account (for testing UI). */
    router.post('/line/send-home', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        try {
            if (!line.isMessagingConfigured()) {
                return res.status(503).json({
                    success: false,
                    message: 'ยังไม่ได้ตั้งค่า LINE Messaging API'
                });
            }
            const pool = await poolPromise;
            const lineUserId = await line.getLinkedLineUserId(pool, user.user_id);
            if (!lineUserId) {
                return res.status(404).json({
                    success: false,
                    message: 'ยังไม่ได้เชื่อมบัญชี LINE — เปิด LineApp แล้วกดเชื่อมก่อน'
                });
            }
            await line.pushMessage(lineUserId, line.buildHomeMessages({
                displayName: user.name || user.username || ''
            }));
            return res.json({ success: true, message: 'ส่งเมนูสวยๆ เข้า LINE แล้ว เปิดแชท OA ดูได้เลย' });
        } catch (error) {
            console.error('[line/send-home]', error.message);
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

function createLineWebhookHandler({ poolPromise }) {
    return async function handleLineWebhook(req, res) {
        try {
            const signature = req.get('x-line-signature') || '';
            const raw = req.body; // Buffer from express.raw
            if (!line.verifySignature(raw, signature)) {
                return res.status(401).json({ success: false, message: 'invalid signature' });
            }

            let payload;
            try {
                payload = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '{}'));
            } catch (_) {
                return res.status(400).json({ success: false, message: 'invalid json' });
            }

            // Acknowledge quickly; process async
            res.status(200).json({ success: true });

            const events = Array.isArray(payload.events) ? payload.events : [];
            for (const event of events) {
                try {
                    await handleEvent(poolPromise, event);
                } catch (err) {
                    console.error('[line/webhook] event:', err.message);
                }
            }
        } catch (error) {
            console.error('[line/webhook]', error.message);
            if (!res.headersSent) res.status(500).json({ success: false, message: error.message });
        }
    };
}

async function handleEvent(poolPromise, event) {
    if (!event || !event.type) return;

    const replyHome = async (replyToken, displayName) => {
        try {
            await line.replyMessage(replyToken, line.buildHomeMessages({ displayName }));
        } catch (err) {
            console.error('[line] home flex failed, fallback menu:', err.message);
            try {
                await line.replyMessage(replyToken, [line.buildMenuFlex()]);
            } catch (err2) {
                console.error('[line] menu fallback failed:', err2.message);
                await line.replyMessage(replyToken, [
                    line.buildText('ยินดีต้อนรับสู่ PTS Learning\nพิมพ์ “เมนู” หรือ “คอร์ส” เพื่อเริ่มใช้งาน')
                ]);
            }
        }
    };

    if (event.type === 'follow' || event.type === 'join') {
        if (event.replyToken) {
            let displayName = '';
            try {
                if (event.source?.userId && line.getChannelAccessToken()) {
                    const profile = await line.lineApi(`/v2/bot/profile/${event.source.userId}`, 'GET');
                    displayName = profile.displayName || '';
                }
            } catch (_) { /* ignore */ }
            await replyHome(event.replyToken, displayName);
        }
        return;
    }

    if (event.type === 'message' && event.message?.type === 'text') {
        const text = String(event.message.text || '').trim().toLowerCase();
        const wantHello = /^(สวัสดี|hello|hi|hey|ดี|ทัก|เริ่ม|start|เมนู|menu|help)$/i.test(text)
            || /สวัสดี|เมนู|ทักทาย/.test(text);
        const wantCourses = /คอร์ส|หลักสูตร|course|สมัคร/.test(text);
        const wantSchedule = /ตาราง|schedule|calendar|ปฏิทิน/.test(text);
        const wantMine = /ของฉัน|my course|เรียนของฉัน/.test(text);
        const wantProfile = /โปรไฟล์|profile|เชื่อม|บัญชี/.test(text);
        const wantHelp = /ช่วย|help|support|ติดต่อ/.test(text);

        if (!event.replyToken) return;

        if (wantHello) {
            await replyHome(event.replyToken);
            return;
        }

        if (wantMine) {
            await line.replyMessage(event.replyToken, [
                line.buildNotifyFlex(
                    'คอร์สของฉัน',
                    'เปิดดูหลักสูตรที่สมัครไว้ และเข้าเรียนต่อได้ทันที',
                    'MyCourses.html'
                )
            ]);
            return;
        }

        if (wantSchedule) {
            await line.replyMessage(event.replyToken, [
                line.buildNotifyFlex(
                    'ตารางเรียน',
                    'ดูรอบเรียน Online / Onsite / Hybrid ของคุณ',
                    'Schedule.html'
                )
            ]);
            return;
        }

        if (wantProfile) {
            await line.replyMessage(event.replyToken, [
                line.buildNotifyFlex(
                    'โปรไฟล์และการเชื่อมต่อ',
                    'เชื่อมบัญชี PTS กับ LINE เพื่อรับแจ้งเตือน',
                    'LineApp.html#profile'
                )
            ]);
            return;
        }

        if (wantHelp) {
            await line.replyMessage(event.replyToken, [line.buildMenuFlex(), line.buildQuickActionsCarousel()]);
            return;
        }

        if (wantCourses) {
            try {
                const pool = await poolPromise;
                const result = await pool.request().query(`
                    SELECT TOP 8
                        course_id, course_name_th, course_name_en,
                        COALESCE(NULLIF(LTRIM(RTRIM(course_name_th)), N''), course_name) AS course_name,
                        instructor_name_th, instructor_name_en,
                        COALESCE(NULLIF(LTRIM(RTRIM(instructor_name_th)), N''), instructor_name) AS instructor_name,
                        total_hours, price,
                        delivery_mode, cover_image_url, is_featured
                    FROM dbo.courses
                    WHERE (
                        flag_use IS NULL
                        OR UPPER(LTRIM(RTRIM(CONVERT(NVARCHAR(20), flag_use)))) IN (N'Y', N'YES', N'1', N'TRUE', N'T')
                    )
                    ORDER BY ISNULL(is_featured, 0) DESC, course_id DESC
                `);
                const courses = result.recordset || [];
                if (courses.length) {
                    await line.replyMessage(event.replyToken, [
                        line.buildText('คอร์สเรียนแนะนำ — ปัดดูรายละเอียดได้เลย'),
                        line.buildCourseCarousel(courses)
                    ]);
                    return;
                }
            } catch (err) {
                console.warn('[line] courses carousel:', err.message);
            }
            await line.replyMessage(event.replyToken, [
                line.buildNotifyFlex(
                    'คอร์สเรียนแนะนำ',
                    'ยกระดับทักษะสู่ความเป็นมืออาชีพ — เปิดรายการหลักสูตรในแอป',
                    'LineApp.html#courses'
                )
            ]);
            return;
        }

        // Default: full branded home UI (not plain text)
        await replyHome(event.replyToken);
        return;
    }

    if (event.type === 'postback' && event.replyToken) {
        await replyHome(event.replyToken);
    }
}

module.exports = {
    createLineRouter,
    createLineWebhookHandler
};
