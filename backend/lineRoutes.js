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
                    FROM BD_PTS.dbo.line_account_links
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
                    SELECT user_id FROM BD_PTS.dbo.line_account_links
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
                    MERGE BD_PTS.dbo.line_account_links AS t
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
                .query(`DELETE FROM BD_PTS.dbo.line_account_links WHERE user_id = @userId`);
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
                    UPDATE BD_PTS.dbo.line_account_links
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

async function handleEvent(_poolPromise, event) {
    if (!event || !event.type) return;

    if (event.type === 'follow' || event.type === 'join') {
        if (event.replyToken) {
            await line.replyMessage(event.replyToken, [
                line.buildText(`ยินดีต้อนรับสู่ ${line.getOaName()}\nกดเมนูด้านล่างเพื่อเรียน / ดูตาราง / เชื่อมบัญชี`),
                line.buildMenuFlex()
            ]);
        }
        return;
    }

    if (event.type === 'message' && event.message?.type === 'text') {
        const text = String(event.message.text || '').trim().toLowerCase();
        const wantCourses = /คอร์ส|หลักสูตร|course/.test(text);
        const wantSchedule = /ตาราง|schedule|calendar|ปฏิทิน/.test(text);
        const wantMine = /ของฉัน|my course|เรียนของฉัน/.test(text);

        if (!event.replyToken) return;

        if (wantMine) {
            await line.replyMessage(event.replyToken, [
                line.buildText('เปิดคอร์สของฉันได้จากปุ่มด้านล่าง'),
                {
                    type: 'template',
                    altText: 'คอร์สของฉัน',
                    template: {
                        type: 'buttons',
                        text: 'ไปที่คอร์สที่สมัครไว้',
                        actions: [
                            { type: 'uri', label: 'คอร์สของฉัน', uri: line.absoluteUrl('/MyCourses.html') },
                            { type: 'uri', label: 'เปิดแอปใน LINE', uri: line.lineAppPath() }
                        ]
                    }
                }
            ]);
            return;
        }

        if (wantSchedule) {
            await line.replyMessage(event.replyToken, [
                line.buildText('ดูตารางเรียนได้ที่นี่'),
                {
                    type: 'template',
                    altText: 'ตารางเรียน',
                    template: {
                        type: 'buttons',
                        text: 'เปิดตารางเรียน PTS',
                        actions: [
                            { type: 'uri', label: 'ตารางเรียน', uri: line.absoluteUrl('/Schedule.html') },
                            { type: 'uri', label: 'เปิดแอปใน LINE', uri: line.lineAppPath() }
                        ]
                    }
                }
            ]);
            return;
        }

        if (wantCourses) {
            await line.replyMessage(event.replyToken, [
                line.buildText('เลือกดูหลักสูตรทั้งหมดได้เลย'),
                {
                    type: 'template',
                    altText: 'หลักสูตร',
                    template: {
                        type: 'buttons',
                        text: 'เปิดหน้ารายการหลักสูตร',
                        actions: [
                            { type: 'uri', label: 'ดูหลักสูตร', uri: line.absoluteUrl('/Courses.html') },
                            { type: 'uri', label: 'เปิดแอปใน LINE', uri: line.lineAppPath() }
                        ]
                    }
                }
            ]);
            return;
        }

        // Default: branded easy menu
        await line.replyMessage(event.replyToken, [line.buildMenuFlex()]);
        return;
    }

    if (event.type === 'postback' && event.replyToken) {
        await line.replyMessage(event.replyToken, [line.buildMenuFlex()]);
    }
}

module.exports = {
    createLineRouter,
    createLineWebhookHandler
};
