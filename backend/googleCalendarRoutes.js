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
    getCourseNotifyPref,
    setCourseNotifyPref,
    newOAuthState
} = require('./googleCalendar');
const { completeGoogleLogin } = require('./googleAuthRoutes');

/** Allow only same-origin relative paths (e.g. /CourseDetail.html?courseId=1). */
function sanitizeReturnTo(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s || !s.startsWith('/') || s.startsWith('//') || s.includes('://')) return null;
    if (s.length > 500) return null;
    return s;
}

function redirectWithGcal(res, basePath, status, extraQuery) {
    const dest = basePath || '/Settings.html';
    const params = new URLSearchParams({ gcal: status });
    if (extraQuery && extraQuery.msg) params.set('msg', String(extraQuery.msg).slice(0, 300));
    const join = dest.includes('?') ? '&' : '?';
    return res.redirect(`${dest}${join}${params.toString()}`);
}

function createGoogleCalendarRouter({ poolPromise, requireLogin }) {
    const router = express.Router();

    router.get('/google/diagnose', (req, res) => {
        res.json(diagnoseGoogleSetup());
    });

    router.get('/google/status', async (req, res) => {
        const base = publicGoogleStatus();
        const user = req.session && req.session.user;
        if (!user || !user.user_id) {
            return res.json({ success: true, ...base, configured: base.configured, connected: false, loggedIn: false });
        }
        try {
            const pool = await poolPromise;
            const link = await getLink(pool, user.user_id);
            return res.json({
                success: true,
                ...base,
                configured: Boolean(base.configured),
                loggedIn: true,
                connected: Boolean(link),
                google_email: link ? link.google_email : null,
                connected_at: link ? link.connected_at : null,
                reminders_enabled: link
                    ? !(link.reminders_enabled === false || link.reminders_enabled === 0)
                    : true
            });
        } catch (error) {
            // อย่าทำให้หน้า Settings เข้าใจว่า OAuth ยังไม่พร้อม — แค่เช็ค connection ใน DB ไม่ได้
            return res.json({
                success: true,
                ...base,
                configured: Boolean(base.configured),
                loggedIn: true,
                connected: false,
                google_email: null,
                reminders_enabled: true,
                warning: error.message
            });
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
        req.session.googleOAuthPurpose = 'calendar';
        const returnTo = sanitizeReturnTo(req.query.returnTo);
        if (returnTo) req.session.googleOAuthReturnTo = returnTo;
        else delete req.session.googleOAuthReturnTo;

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
        const purpose = req.session && req.session.googleOAuthPurpose;
        const loginUrl = '/Login.html?google=';
        const returnTo = sanitizeReturnTo(req.session && req.session.googleOAuthReturnTo) || '/Settings.html';

        // —— โหมดเข้าสู่ระบบด้วย Gmail ——
        if (purpose === 'login') {
            if (error) {
                return res.redirect(`${loginUrl}error&msg=${encodeURIComponent(String(error))}`);
            }
            const sessionState = req.session && req.session.googleOAuthState;
            if (sessionState && state && sessionState !== state) {
                return res.redirect(`${loginUrl}error&msg=${encodeURIComponent('การยืนยัน Google ไม่สำเร็จ (state ไม่ตรง) กรุณาลองใหม่')}`);
            }
            if (!code) {
                return res.redirect(`${loginUrl}error&msg=${encodeURIComponent('ไม่ได้รับรหัสยืนยันจาก Google')}`);
            }
            return completeGoogleLogin(req, res, { poolPromise, code: String(code) });
        }

        if (error) {
            delete req.session.googleOAuthReturnTo;
            return redirectWithGcal(res, returnTo, 'error', { msg: String(error) });
        }

        const sessionState = req.session && req.session.googleOAuthState;
        const userId = (req.session && req.session.googleOAuthUserId)
            || (req.session && req.session.user && req.session.user.user_id);

        if (!code || !userId) {
            delete req.session.googleOAuthReturnTo;
            return redirectWithGcal(res, returnTo, 'error', {
                msg: 'การยืนยัน Google ไม่สำเร็จ (ไม่มี code หรือยังไม่ล็อกอิน) กรุณาเข้าสู่ระบบแล้วลองใหม่'
            });
        }

        // ถ้า state ใน session หาย (เบราว์เซอร์บางตัว) ยังให้ผ่านได้เมื่อมี user login อยู่
        if (sessionState && state && sessionState !== state) {
            delete req.session.googleOAuthReturnTo;
            return redirectWithGcal(res, returnTo, 'error', { msg: 'การยืนยัน Google ไม่สำเร็จ (state ไม่ตรง) กรุณาลองใหม่' });
        }

        try {
            const tokens = await exchangeCode(String(code));
            const email = await fetchGoogleEmail(tokens.access_token);
            const pool = await poolPromise;
            await saveLink(pool, userId, tokens, email);

            delete req.session.googleOAuthState;
            delete req.session.googleOAuthUserId;
            delete req.session.googleOAuthPurpose;
            delete req.session.googleOAuthReturnTo;

            syncUserSchedules(pool, userId, { notify: true }).catch((err) => {
                console.warn('[google-calendar] post-connect sync:', err.message);
            });

            return redirectWithGcal(res, returnTo, 'connected');
        } catch (err) {
            console.error('[google-calendar] callback:', err.message);
            delete req.session.googleOAuthReturnTo;
            return redirectWithGcal(res, returnTo, 'error', { msg: err.message });
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
            const courseId = parseInt((req.body && req.body.courseId) || req.query.courseId, 10) || null;
            const result = await syncUserSchedules(pool, user.user_id, {
                notify: true,
                courseId: courseId || undefined
            });
            const status = result.success ? 200 : (result.connected === false ? 400 : 503);
            return res.status(status).json(result);
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/google/course-notify', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const courseId = parseInt(req.query.courseId, 10);
        if (!courseId) {
            return res.status(400).json({ success: false, message: 'ต้องระบุ courseId' });
        }
        try {
            const pool = await poolPromise;
            const pref = await getCourseNotifyPref(pool, user.user_id, courseId);
            return res.json({ success: true, ...pref });
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/google/course-notify', async (req, res) => {
        const user = requireLogin(req, res);
        if (!user) return;
        const courseId = parseInt(req.body && req.body.courseId, 10);
        if (!courseId) {
            return res.status(400).json({ success: false, message: 'ต้องระบุ courseId' });
        }
        const enabled = !(req.body && (req.body.enabled === false || req.body.enabled === 0 || req.body.enabled === '0'));
        try {
            const pool = await poolPromise;
            const result = await setCourseNotifyPref(pool, user.user_id, courseId, enabled);
            const status = result.success ? 200 : 400;
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
