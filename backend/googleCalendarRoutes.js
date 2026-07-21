const express = require('express');
const {
    isGoogleConfigured,
    publicGoogleStatus,
    diagnoseGoogleSetup,
    buildAuthUrl,
    exchangeCode,
    fetchGoogleEmail,
    saveLink,
    getLink,
    setRemindersEnabled,
    syncUserSchedules,
    disconnectUser,
    newOAuthState
} = require('./googleCalendar');

function createGoogleCalendarRouter({ poolPromise, requireLogin }) {
    const router = express.Router();

    router.get('/google/diagnose', (req, res) => {
        res.json(diagnoseGoogleSetup());
    });

    router.get('/google/status', async (req, res) => {
        const base = publicGoogleStatus();
        const user = req.session && req.session.user;
        if (!user || !user.user_id) {
            return res.json({ success: true, ...base, connected: false, loggedIn: false });
        }
        try {
            const pool = await poolPromise;
            const link = await getLink(pool, user.user_id);
            return res.json({
                success: true,
                ...base,
                loggedIn: true,
                connected: Boolean(link),
                google_email: link ? link.google_email : null,
                connected_at: link ? link.connected_at : null,
                reminders_enabled: link
                    ? !(link.reminders_enabled === false || link.reminders_enabled === 0)
                    : true
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message, ...base });
        }
    });

    router.get('/google/oauth/start', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        if (!isGoogleConfigured()) {
            return res.status(503).json({
                success: false,
                message: 'ยังไม่ได้ตั้งค่า Google OAuth — ตรวจ backend/google.local.js หรือรัน /api/google/diagnose',
                ...publicGoogleStatus(),
                diagnose: diagnoseGoogleSetup()
            });
        }

        const state = newOAuthState();
        req.session.googleOAuthState = state;
        req.session.googleOAuthUserId = user.user_id;

        const finish = (url) => {
            const wantJson = req.query.redirect === '0'
                || (req.headers.accept && String(req.headers.accept).includes('application/json'));
            if (wantJson) return res.json({ success: true, url });
            return res.redirect(url);
        };

        try {
            const url = buildAuthUrl(state);
            // สำคัญ: บันทึก session ก่อนเด้งไป Google ไม่งั้น state หาย
            if (typeof req.session.save === 'function') {
                return req.session.save((err) => {
                    if (err) {
                        console.error('[google-calendar] session.save:', err.message);
                        return res.status(500).json({ success: false, message: 'บันทึก session ไม่สำเร็จ' });
                    }
                    return finish(url);
                });
            }
            return finish(url);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/google/oauth/callback', async (req, res) => {
        const { code, state, error } = req.query;
        const settingsUrl = '/Settings.html?gcal=';

        if (error) {
            return res.redirect(`${settingsUrl}error&msg=${encodeURIComponent(String(error))}`);
        }

        const sessionState = req.session && req.session.googleOAuthState;
        const userId = (req.session && req.session.googleOAuthUserId)
            || (req.session && req.session.user && req.session.user.user_id);

        if (!code || !userId) {
            return res.redirect(`${settingsUrl}error&msg=${encodeURIComponent('การยืนยัน Google ไม่สำเร็จ (ไม่มี code หรือยังไม่ล็อกอิน) กรุณาเข้าสู่ระบบแล้วลองใหม่')}`);
        }

        // ถ้า state ใน session หาย (เบราว์เซอร์บางตัว) ยังให้ผ่านได้เมื่อมี user login อยู่
        if (sessionState && state && sessionState !== state) {
            return res.redirect(`${settingsUrl}error&msg=${encodeURIComponent('การยืนยัน Google ไม่สำเร็จ (state ไม่ตรง) กรุณาลองใหม่')}`);
        }

        try {
            const tokens = await exchangeCode(String(code));
            const email = await fetchGoogleEmail(tokens.access_token);
            const pool = await poolPromise;
            await saveLink(pool, userId, tokens, email);

            delete req.session.googleOAuthState;
            delete req.session.googleOAuthUserId;

            syncUserSchedules(pool, userId, { notify: true }).catch((err) => {
                console.warn('[google-calendar] post-connect sync:', err.message);
            });

            return res.redirect(`${settingsUrl}connected`);
        } catch (err) {
            console.error('[google-calendar] callback:', err.message);
            return res.redirect(`${settingsUrl}error&msg=${encodeURIComponent(err.message)}`);
        }
    });

    router.post('/google/reminders', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        const enabled = Boolean(req.body && (req.body.enabled === true || req.body.enabled === 1 || req.body.enabled === '1'));
        try {
            const pool = await poolPromise;
            const result = await setRemindersEnabled(pool, user.user_id, enabled);
            const status = result.success ? 200 : 400;
            return res.status(status).json(result);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/google/sync', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        try {
            const pool = await poolPromise;
            const result = await syncUserSchedules(pool, user.user_id, { notify: true });
            const status = result.success ? 200 : (result.connected === false ? 400 : 503);
            return res.status(status).json(result);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/google/disconnect', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;

        try {
            const pool = await poolPromise;
            const deleteEvents = Boolean(req.body && req.body.delete_events);
            await disconnectUser(pool, user.user_id, { deleteEvents });
            return res.json({
                success: true,
                message: deleteEvents
                    ? 'ยกเลิกการเชื่อมต่อและลบอีเวนต์ออกจากปฏิทินแล้ว'
                    : 'ยกเลิกการเชื่อมต่อ Google Calendar แล้ว'
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

module.exports = { createGoogleCalendarRouter };
