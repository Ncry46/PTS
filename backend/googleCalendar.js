/**
 * Google Calendar OAuth + event sync for PTS Learning class schedules.
 * Reminders are handled by Google Calendar (popup + email) — no cron needed.
 *
 * Config (any of):
 *   .env  GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI / APP_BASE_URL
 *   backend/google.local.js  (gitignored copy of google.local.example.js)
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const fetch = require('node-fetch');
const { createNotification } = require('./ensureSchema');

const SCOPES = ['https://www.googleapis.com/auth/calendar.events', 'openid', 'email', 'profile'];
const LOGIN_SCOPES = ['openid', 'email', 'profile'];
const TIMEZONE = 'Asia/Bangkok';
const LOCAL_PATH = path.join(__dirname, 'google.local.js');

function pickNonEmpty(...values) {
    for (const value of values) {
        const s = String(value == null ? '' : value).trim();
        if (s) return s;
    }
    return '';
}

function readLocalFileText() {
    if (!fs.existsSync(LOCAL_PATH)) return { text: '', encoding: 'missing', buf: null };
    const buf = fs.readFileSync(LOCAL_PATH);
    if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
        return { text: buf.toString('utf16le'), encoding: 'utf16le-bom', buf };
    }
    if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
        // UTF-16 BE — uncommon, but heal by swapping
        const swapped = Buffer.alloc(buf.length - 2);
        for (let i = 2; i + 1 < buf.length; i += 2) {
            swapped[i - 2] = buf[i + 1];
            swapped[i - 1] = buf[i];
        }
        return { text: swapped.toString('utf16le'), encoding: 'utf16be-bom', buf };
    }
    return {
        text: buf.toString('utf8').replace(/^\uFEFF/, ''),
        encoding: (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) ? 'utf8-bom' : 'utf8-or-ascii',
        buf
    };
}

function parseLocalObject(text) {
    if (!text) return {};
    const match = text.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (match) {
        // eslint-disable-next-line no-new-func
        const obj = Function('"use strict"; return (' + match[1] + ')')();
        return obj && typeof obj === 'object' ? obj : {};
    }
    try {
        delete require.cache[require.resolve('./google.local.js')];
        return require('./google.local.js') || {};
    } catch (_) {
        return {};
    }
}

function writeLocalGoogleFile(config) {
    const body = `module.exports = {
    clientId: ${JSON.stringify(String(config.clientId || ''))},
    clientSecret: ${JSON.stringify(String(config.clientSecret || ''))},
    redirectUri: ${JSON.stringify(String(config.redirectUri || 'http://localhost:3000/api/google/oauth/callback'))},
    appBaseUrl: ${JSON.stringify(String(config.appBaseUrl || 'http://localhost:3000'))}
};
`;
    fs.writeFileSync(LOCAL_PATH, body, { encoding: 'utf8' });
}

function readLocalGoogle() {
    try {
        const { text, encoding } = readLocalFileText();
        if (!text) return {};
        const obj = parseLocalObject(text);
        // Auto-heal PowerShell UTF-16 files so require()/future boots stay reliable
        if (encoding.startsWith('utf16') && obj && (obj.clientId || obj.clientSecret)) {
            try {
                writeLocalGoogleFile({
                    clientId: obj.clientId,
                    clientSecret: obj.clientSecret,
                    redirectUri: obj.redirectUri,
                    appBaseUrl: obj.appBaseUrl
                });
                console.warn('[google-calendar] แปลง google.local.js จาก UTF-16 → UTF-8 แล้ว');
            } catch (healErr) {
                console.warn('[google-calendar] heal UTF-16 ไม่สำเร็จ:', healErr.message);
            }
        }
        return obj && typeof obj === 'object' ? obj : {};
    } catch (err) {
        console.warn('[google-calendar] อ่าน google.local.js ไม่สำเร็จ:', err.message);
        return {};
    }
}

/** Fill empty process.env Google keys from google.local.js (runtime only). */
function hydrateGoogleEnvFromLocal() {
    const local = readLocalGoogle();
    if (!local || typeof local !== 'object') return getGoogleConfig();
    if (!pickNonEmpty(process.env.GOOGLE_CLIENT_ID) && local.clientId) {
        process.env.GOOGLE_CLIENT_ID = String(local.clientId).trim();
    }
    if (!pickNonEmpty(process.env.GOOGLE_CLIENT_SECRET) && local.clientSecret) {
        process.env.GOOGLE_CLIENT_SECRET = String(local.clientSecret).trim();
    }
    if (!pickNonEmpty(process.env.GOOGLE_REDIRECT_URI) && local.redirectUri) {
        process.env.GOOGLE_REDIRECT_URI = String(local.redirectUri).trim();
    }
    if (!pickNonEmpty(process.env.APP_BASE_URL) && local.appBaseUrl) {
        process.env.APP_BASE_URL = String(local.appBaseUrl).trim();
    }
    return getGoogleConfig();
}

function getGoogleConfig() {
    const local = readLocalGoogle();
    const baseUrl = pickNonEmpty(
        process.env.APP_BASE_URL,
        local.appBaseUrl,
        'http://localhost:3000'
    ).replace(/\/$/, '');
    const redirectUri = pickNonEmpty(
        process.env.GOOGLE_REDIRECT_URI,
        local.redirectUri,
        `${baseUrl}/api/google/oauth/callback`
    );
    return {
        clientId: pickNonEmpty(process.env.GOOGLE_CLIENT_ID, local.clientId),
        clientSecret: pickNonEmpty(process.env.GOOGLE_CLIENT_SECRET, local.clientSecret),
        redirectUri,
        appBaseUrl: baseUrl,
        hasLocalFile: fs.existsSync(LOCAL_PATH),
        localKeys: Object.keys(local || {})
    };
}

function isGoogleConfigured() {
    const c = getGoogleConfig();
    return Boolean(c.clientId && c.clientSecret && c.redirectUri);
}

function publicGoogleStatus() {
    const c = getGoogleConfig();
    return {
        configured: isGoogleConfigured(),
        redirectUri: c.redirectUri,
        appBaseUrl: c.appBaseUrl,
        hasLocalFile: c.hasLocalFile,
        clientIdHint: c.clientId ? (c.clientId.slice(0, 12) + '…') : null
    };
}

function diagnoseGoogleSetup() {
    const { encoding, buf } = readLocalFileText();
    const c = getGoogleConfig();
    return {
        success: true,
        configured: isGoogleConfigured(),
        hasLocalFile: c.hasLocalFile,
        localPath: LOCAL_PATH,
        fileBytes: buf ? buf.length : 0,
        fileEncodingGuess: encoding,
        clientIdHint: c.clientId ? (c.clientId.slice(0, 20) + '…') : null,
        hasClientSecret: Boolean(c.clientSecret),
        redirectUri: c.redirectUri,
        appBaseUrl: c.appBaseUrl,
        envHasClientId: Boolean(pickNonEmpty(process.env.GOOGLE_CLIENT_ID)),
        envHasClientSecret: Boolean(pickNonEmpty(process.env.GOOGLE_CLIENT_SECRET)),
        localHasClientId: Boolean(pickNonEmpty((readLocalGoogle() || {}).clientId)),
        moduleFile: path.join(__dirname, 'googleCalendar.js'),
        moduleExists: fs.existsSync(path.join(__dirname, 'googleCalendar.js')),
        hint: isGoogleConfigured()
            ? 'พร้อมใช้งาน — ให้ผู้ใช้กดเชื่อมต่อ Google Calendar ที่หน้า Settings'
            : 'ยังไม่พร้อม — ตั้งค่าใน .env หรือรัน: node backend/write-google-local.js <CLIENT_ID> <CLIENT_SECRET> แล้วรีสตาร์ทเซิร์ฟเวอร์'
    };
}

function pad(n) {
    return String(n).padStart(2, '0');
}

/** Format Date as local wall-clock for Asia/Bangkok Calendar API. */
function formatDateTimeLocal(value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error('วันที่ไม่ถูกต้อง');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function buildEventBody(schedule, options = {}) {
    const remindersEnabled = options.remindersEnabled !== false;
    const courseLabel = schedule.course_name ? ` · ${schedule.course_name}` : '';
    const lines = [
        'ตารางเรียนจาก PTS Learning',
        schedule.course_name ? `หลักสูตร: ${schedule.course_name}` : '',
        schedule.delivery_mode ? `รูปแบบ: ${schedule.delivery_mode}` : '',
        schedule.meeting_url ? `ลิงก์เข้าเรียน: ${schedule.meeting_url}` : '',
        schedule.location ? `สถานที่: ${schedule.location}` : '',
        remindersEnabled
            ? 'การแจ้งเตือน: เปิด (ล่วงหน้า 1 วัน และ 1 ชั่วโมง)'
            : 'การแจ้งเตือน: ปิดโดยผู้ใช้',
        'ดูตารางทั้งหมด: ' + (getGoogleConfig().appBaseUrl + '/Schedule.html')
    ].filter(Boolean);

    return {
        summary: `${schedule.title}${courseLabel}`,
        description: lines.join('\n'),
        location: schedule.location || schedule.meeting_url || '',
        start: {
            dateTime: formatDateTimeLocal(schedule.start_at),
            timeZone: TIMEZONE
        },
        end: {
            dateTime: formatDateTimeLocal(schedule.end_at),
            timeZone: TIMEZONE
        },
        reminders: remindersEnabled
            ? {
                useDefault: false,
                overrides: [
                    { method: 'popup', minutes: 24 * 60 },
                    { method: 'popup', minutes: 60 },
                    { method: 'email', minutes: 24 * 60 }
                ]
            }
            : {
                useDefault: false,
                overrides: []
            },
        source: {
            title: 'PTS Learning',
            url: getGoogleConfig().appBaseUrl + '/Schedule.html'
        }
    };
}

function buildAuthUrl(state, options = {}) {
    const c = getGoogleConfig();
    if (!c.clientId) throw new Error('ยังไม่ได้ตั้งค่า GOOGLE_CLIENT_ID');
    const scopes = Array.isArray(options.scopes) && options.scopes.length
        ? options.scopes
        : SCOPES;
    const params = new URLSearchParams({
        client_id: c.clientId,
        redirect_uri: options.redirectUri || c.redirectUri,
        response_type: 'code',
        scope: scopes.join(' '),
        access_type: options.accessType || 'offline',
        prompt: options.prompt || 'consent',
        include_granted_scopes: 'true',
        state
    });
    if (options.loginHint) params.set('login_hint', options.loginHint);
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** OAuth สำหรับเข้าสู่ระบบด้วย Gmail (ไม่ขอสิทธิ์ Calendar) */
function buildLoginAuthUrl(state) {
    return buildAuthUrl(state, {
        scopes: LOGIN_SCOPES,
        accessType: 'online',
        prompt: 'select_account'
    });
}

async function exchangeCode(code, redirectUriOverride) {
    const c = getGoogleConfig();
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: c.clientId,
            client_secret: c.clientSecret,
            redirect_uri: redirectUriOverride || c.redirectUri,
            grant_type: 'authorization_code'
        })
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error_description || data.error || 'แลกโค้ด Google ไม่สำเร็จ');
    }
    return data;
}

async function refreshAccessToken(refreshToken) {
    const c = getGoogleConfig();
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: c.clientId,
            client_secret: c.clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })
    });
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error_description || data.error || 'รีเฟรชโทเคน Google ไม่สำเร็จ');
    }
    return data;
}

async function fetchGoogleEmail(accessToken) {
    const profile = await fetchGoogleProfile(accessToken);
    return profile && profile.email ? profile.email : null;
}

async function fetchGoogleProfile(accessToken) {
    try {
        const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        return {
            email: data.email || null,
            name: data.name || data.given_name || null,
            picture: data.picture || null,
            sub: data.id || data.sub || null,
            emailVerified: data.verified_email !== false
        };
    } catch (_) {
        return null;
    }
}

async function getLink(pool, userId) {
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
            SELECT user_id, google_email, access_token, refresh_token, token_expiry, calendar_id,
                   connected_at, ISNULL(reminders_enabled, 1) AS reminders_enabled
            FROM BD_PTS.dbo.google_calendar_links
            WHERE user_id = @userId
        `);
    return result.recordset[0] || null;
}

async function setRemindersEnabled(pool, userId, enabled) {
    const link = await getLink(pool, userId);
    if (!link) {
        return { success: false, message: 'ยังไม่ได้เชื่อมต่อ Google Calendar' };
    }
    await pool.request()
        .input('userId', sql.Int, userId)
        .input('enabled', sql.Bit, enabled ? 1 : 0)
        .query(`
            UPDATE BD_PTS.dbo.google_calendar_links
            SET reminders_enabled = @enabled, updated_at = GETDATE()
            WHERE user_id = @userId
        `);

    // อัปเดตอีเวนต์ในปฏิทินให้ตรงกับสถานะแจ้งเตือน
    const sync = await syncUserSchedules(pool, userId, { notify: false });
    return {
        success: true,
        reminders_enabled: Boolean(enabled),
        synced: sync.synced || 0,
        message: enabled
            ? 'เปิดการแจ้งเตือนแล้ว (ล่วงหน้า 1 วัน และ 1 ชั่วโมง) และอัปเดตปฏิทินแล้ว'
            : 'ปิดการแจ้งเตือนแล้ว และอัปเดตปฏิทินแล้ว'
    };
}

async function saveLink(pool, userId, tokens, googleEmail) {
    const expiry = tokens.expires_in
        ? new Date(Date.now() + Number(tokens.expires_in) * 1000)
        : null;
    const existing = await getLink(pool, userId);
    const refresh = tokens.refresh_token || (existing && existing.refresh_token) || null;
    if (!refresh) {
        throw new Error('ไม่ได้รับ refresh_token จาก Google — ลองยกเลิกสิทธิ์แอปแล้วเชื่อมใหม่');
    }

    await pool.request()
        .input('userId', sql.Int, userId)
        .input('email', sql.NVarChar, googleEmail || (existing && existing.google_email) || null)
        .input('access', sql.NVarChar, tokens.access_token)
        .input('refresh', sql.NVarChar, refresh)
        .input('expiry', sql.DateTime, expiry)
        .query(`
            IF EXISTS (SELECT 1 FROM BD_PTS.dbo.google_calendar_links WHERE user_id = @userId)
                UPDATE BD_PTS.dbo.google_calendar_links
                SET google_email = @email,
                    access_token = @access,
                    refresh_token = @refresh,
                    token_expiry = @expiry,
                    updated_at = GETDATE()
                WHERE user_id = @userId
            ELSE
                INSERT INTO BD_PTS.dbo.google_calendar_links
                (user_id, google_email, access_token, refresh_token, token_expiry, calendar_id)
                VALUES (@userId, @email, @access, @refresh, @expiry, 'primary')
        `);
}

async function getValidAccessToken(pool, userId) {
    const link = await getLink(pool, userId);
    if (!link) return null;

    const expiry = link.token_expiry ? new Date(link.token_expiry).getTime() : 0;
    if (expiry && expiry > Date.now() + 60 * 1000) {
        return { accessToken: link.access_token, calendarId: link.calendar_id || 'primary', link };
    }

    if (!link.refresh_token) return null;

    const refreshed = await refreshAccessToken(link.refresh_token);
    await saveLink(pool, userId, {
        access_token: refreshed.access_token,
        refresh_token: link.refresh_token,
        expires_in: refreshed.expires_in
    }, link.google_email);

    return {
        accessToken: refreshed.access_token,
        calendarId: link.calendar_id || 'primary',
        link: await getLink(pool, userId)
    };
}

async function calendarApi(accessToken, method, urlPath, body) {
    const res = await fetch(`https://www.googleapis.com/calendar/v3${urlPath}`, {
        method,
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = { raw: text }; }
    if (!res.ok) {
        const msg = (data && (data.error && data.error.message)) || text || 'Google Calendar API error';
        const err = new Error(msg);
        err.status = res.status;
        throw err;
    }
    return data;
}

async function upsertEventMap(pool, userId, scheduleId, googleEventId) {
    await pool.request()
        .input('userId', sql.Int, userId)
        .input('scheduleId', sql.Int, scheduleId)
        .input('eventId', sql.NVarChar, googleEventId)
        .query(`
            IF EXISTS (
                SELECT 1 FROM BD_PTS.dbo.google_calendar_events
                WHERE user_id = @userId AND schedule_id = @scheduleId
            )
                UPDATE BD_PTS.dbo.google_calendar_events
                SET google_event_id = @eventId, synced_at = GETDATE()
                WHERE user_id = @userId AND schedule_id = @scheduleId
            ELSE
                INSERT INTO BD_PTS.dbo.google_calendar_events (user_id, schedule_id, google_event_id)
                VALUES (@userId, @scheduleId, @eventId)
        `);
}

async function getEventMap(pool, userId, scheduleId) {
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('scheduleId', sql.Int, scheduleId)
        .query(`
            SELECT google_event_id FROM BD_PTS.dbo.google_calendar_events
            WHERE user_id = @userId AND schedule_id = @scheduleId
        `);
    return result.recordset[0] || null;
}

async function deleteEventMap(pool, userId, scheduleId) {
    await pool.request()
        .input('userId', sql.Int, userId)
        .input('scheduleId', sql.Int, scheduleId)
        .query(`
            DELETE FROM BD_PTS.dbo.google_calendar_events
            WHERE user_id = @userId AND schedule_id = @scheduleId
        `);
}

async function syncOneSchedule(pool, userId, schedule) {
    const auth = await getValidAccessToken(pool, userId);
    if (!auth) return { skipped: true, reason: 'not_connected' };

    const remindersEnabled = !(auth.link && (auth.link.reminders_enabled === false || auth.link.reminders_enabled === 0));
    const body = buildEventBody(schedule, { remindersEnabled });
    const calId = encodeURIComponent(auth.calendarId || 'primary');
    const mapped = await getEventMap(pool, userId, schedule.schedule_id);

    if (mapped && mapped.google_event_id) {
        try {
            await calendarApi(auth.accessToken, 'PUT', `/calendars/${calId}/events/${encodeURIComponent(mapped.google_event_id)}`, body);
            await upsertEventMap(pool, userId, schedule.schedule_id, mapped.google_event_id);
            return { updated: true, google_event_id: mapped.google_event_id };
        } catch (err) {
            if (err.status !== 404) throw err;
        }
    }

    const created = await calendarApi(auth.accessToken, 'POST', `/calendars/${calId}/events`, body);
    await upsertEventMap(pool, userId, schedule.schedule_id, created.id);
    return { created: true, google_event_id: created.id };
}

async function deleteOneScheduleEvent(pool, userId, scheduleId) {
    const auth = await getValidAccessToken(pool, userId);
    const mapped = await getEventMap(pool, userId, scheduleId);
    if (!mapped) return { skipped: true };

    if (auth) {
        const calId = encodeURIComponent(auth.calendarId || 'primary');
        try {
            await calendarApi(
                auth.accessToken,
                'DELETE',
                `/calendars/${calId}/events/${encodeURIComponent(mapped.google_event_id)}`
            );
        } catch (err) {
            if (err.status !== 404 && err.status !== 410) {
                console.warn('[google-calendar] delete event:', err.message);
            }
        }
    }
    await deleteEventMap(pool, userId, scheduleId);
    return { deleted: true };
}

async function listUserFutureSchedules(pool, userId, courseId) {
    const req = pool.request().input('userId', sql.Int, userId);
    let courseFilter = '';
    if (courseId) {
        req.input('courseId', sql.Int, courseId);
        courseFilter = 'AND s.course_id = @courseId';
    }
    const result = await req.query(`
        SELECT
            s.schedule_id, s.title, s.start_at, s.end_at, s.location,
            s.meeting_url, s.delivery_mode, s.course_id, c.course_name
        FROM BD_PTS.dbo.class_schedules s
        LEFT JOIN BD_PTS.dbo.courses_main c ON c.course_id = s.course_id
        WHERE s.flag_use = 1
          AND s.course_id IS NOT NULL
          AND s.end_at >= DATEADD(day, -1, GETDATE())
          AND EXISTS (
                SELECT 1 FROM BD_PTS.dbo.course_enrollments e
                WHERE e.user_id = @userId
                  AND e.course_id = s.course_id
                  AND ISNULL(e.gcal_notify, 0) = 1
          )
          ${courseFilter}
        ORDER BY s.start_at ASC
    `);
    return result.recordset;
}

async function isEnrolledInCourse(pool, userId, courseId) {
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .input('courseId', sql.Int, courseId)
        .query(`
            SELECT TOP 1 enrollment_id, ISNULL(gcal_notify, 0) AS gcal_notify
            FROM BD_PTS.dbo.course_enrollments
            WHERE user_id = @userId AND course_id = @courseId
        `);
    return result.recordset[0] || null;
}

async function getCourseNotifyPref(pool, userId, courseId) {
    const enrollment = await isEnrolledInCourse(pool, userId, courseId);
    const link = await getLink(pool, userId);
    return {
        enrolled: Boolean(enrollment),
        connected: Boolean(link),
        configured: isGoogleConfigured(),
        /* Opt-in: only true when user explicitly enabled */
        enabled: enrollment ? (enrollment.gcal_notify === true || enrollment.gcal_notify === 1) : false,
        google_email: link ? link.google_email : null
    };
}

async function removeCourseCalendarEvents(pool, userId, courseId) {
    const maps = await pool.request()
        .input('userId', sql.Int, userId)
        .input('courseId', sql.Int, courseId)
        .query(`
            SELECT e.schedule_id
            FROM BD_PTS.dbo.google_calendar_events e
            INNER JOIN BD_PTS.dbo.class_schedules s ON s.schedule_id = e.schedule_id
            WHERE e.user_id = @userId AND s.course_id = @courseId
        `);
    let removed = 0;
    for (const row of maps.recordset) {
        await deleteOneScheduleEvent(pool, userId, row.schedule_id);
        removed += 1;
    }
    return removed;
}

/**
 * Toggle per-course calendar notify for an enrolled user.
 * enabled=true  → sync this course into Google Calendar
 * enabled=false → remove this course's events from the calendar
 */
async function setCourseNotifyPref(pool, userId, courseId, enabled) {
    const enrollment = await isEnrolledInCourse(pool, userId, courseId);
    if (!enrollment) {
        return { success: false, message: 'ยังไม่ได้สมัครหลักสูตรนี้', enrolled: false };
    }

    const on = Boolean(enabled);
    await pool.request()
        .input('userId', sql.Int, userId)
        .input('courseId', sql.Int, courseId)
        .input('enabled', sql.Bit, on ? 1 : 0)
        .query(`
            UPDATE BD_PTS.dbo.course_enrollments
            SET gcal_notify = @enabled, updated_at = GETDATE()
            WHERE user_id = @userId AND course_id = @courseId
        `);

    const link = await getLink(pool, userId);
    if (!link || !isGoogleConfigured()) {
        return {
            success: true,
            enrolled: true,
            connected: false,
            enabled: on,
            message: on
                ? 'บันทึกแล้ว — เชื่อมต่อ Google Calendar ที่หน้าตั้งค่าเพื่อรับตารางเรียน'
                : 'ปิดการแจ้งเตือนคอร์สนี้แล้ว'
        };
    }

    if (on) {
        const sync = await syncUserSchedules(pool, userId, { courseId, notify: true });
        return {
            success: true,
            enrolled: true,
            connected: true,
            enabled: true,
            synced: sync.synced || 0,
            message: sync.message || 'เปิดรับการแจ้งเตือนคอร์สนี้แล้ว'
        };
    }

    const removed = await removeCourseCalendarEvents(pool, userId, courseId);
    return {
        success: true,
        enrolled: true,
        connected: true,
        enabled: false,
        removed,
        message: removed
            ? `ปิดการแจ้งเตือนแล้ว และลบ ${removed} รายการออกจากปฏิทิน`
            : 'ปิดการแจ้งเตือนคอร์สนี้แล้ว'
    };
}

async function syncUserSchedules(pool, userId, options = {}) {
    if (!isGoogleConfigured()) {
        return { success: false, message: 'ยังไม่ได้ตั้งค่า Google Calendar API', synced: 0 };
    }
    const link = await getLink(pool, userId);
    if (!link) {
        return { success: false, message: 'ยังไม่ได้เชื่อมต่อ Google Calendar', synced: 0, connected: false };
    }

    const schedules = await listUserFutureSchedules(pool, userId, options.courseId || null);
    if (!schedules.length) {
        const hint = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT
                  (SELECT COUNT(*) FROM BD_PTS.dbo.course_enrollments WHERE user_id = @userId) AS enroll_count,
                  (SELECT COUNT(*) FROM BD_PTS.dbo.class_schedules WHERE flag_use = 1 AND course_id IS NOT NULL AND end_at >= DATEADD(day,-1,GETDATE())) AS schedule_count,
                  (SELECT COUNT(*) FROM BD_PTS.dbo.class_schedules WHERE flag_use = 1 AND course_id IS NULL) AS unbound_count
            `);
        const h = hint.recordset[0] || {};
        let message = 'ยังไม่มีตารางเรียนที่จะซิงค์';
        if (!h.enroll_count) {
            message = 'บัญชียังไม่ได้สมัครหลักสูตร — ไปหน้าหลักสูตรแล้วกดสมัครเรียนก่อน แล้วค่อยซิงค์';
        } else if (h.unbound_count > 0 && !h.schedule_count) {
            message = 'มีตารางในระบบแต่ยังไม่ผูกหลักสูตร — ให้แอดมินสร้างตารางใหม่แล้วเลือกหลักสูตรที่คุณสมัครไว้';
        } else if (!h.schedule_count) {
            message = 'ยังไม่มีตารางเรียนในระบบ — ให้แอดมินไป Admin → ตารางเรียน สร้างตารางและเลือกหลักสูตรที่คุณสมัครไว้';
        } else {
            message = 'มีตารางในระบบแล้ว แต่ไม่มีตารางของหลักสูตรที่คุณสมัคร — ให้แอดมินผูกตารางกับหลักสูตรที่บัญชีนี้สมัครไว้ หรือสมัครหลักสูตรที่มีตาราง';
        }
        return {
            success: false,
            connected: true,
            synced: 0,
            total: 0,
            hint: {
                enroll_count: h.enroll_count || 0,
                schedule_count: h.schedule_count || 0,
                unbound_count: h.unbound_count || 0
            },
            message
        };
    }

    let synced = 0;
    const errors = [];
    for (const schedule of schedules) {
        try {
            await syncOneSchedule(pool, userId, schedule);
            synced += 1;
        } catch (err) {
            console.warn('[google-calendar] sync schedule', schedule.schedule_id, err.message);
            errors.push({ schedule_id: schedule.schedule_id, message: err.message });
        }
    }

    if (options.notify && synced > 0) {
        try {
            await createNotification(
                pool,
                userId,
                'ซิงค์ Google Calendar แล้ว',
                `เพิ่ม/อัปเดต ${synced} รายการตารางเรียน พร้อมแจ้งเตือนก่อนวันเรียน`,
                'Schedule.html'
            );
        } catch (_) {}
    }

    return {
        success: true,
        connected: true,
        synced,
        total: schedules.length,
        errors,
        message: synced
            ? `ซิงค์ ${synced} รายการเข้า Google Calendar แล้ว (แจ้งเตือนล่วงหน้า 1 วัน และ 1 ชม.)`
            : (schedules.length ? 'ไม่สามารถซิงค์รายการได้' : 'ยังไม่มีตารางเรียนที่จะซิงค์')
    };
}

/** After enroll: only sync if user already opted in for this course (default is OFF). */
async function syncAfterEnroll(pool, userId, courseId) {
    try {
        const link = await getLink(pool, userId);
        if (!link || !isGoogleConfigured()) return;
        const enrollment = await isEnrolledInCourse(pool, userId, courseId);
        if (!enrollment || !(enrollment.gcal_notify === true || enrollment.gcal_notify === 1)) return;
        await syncUserSchedules(pool, userId, { courseId, notify: true });
    } catch (err) {
        console.warn('[google-calendar] syncAfterEnroll:', err.message);
    }
}

/** After admin creates a schedule: push to all enrolled users who connected Google. */
async function syncScheduleToEnrolledUsers(pool, scheduleId) {
    try {
        if (!isGoogleConfigured()) return;
        const scheduleResult = await pool.request()
            .input('scheduleId', sql.Int, scheduleId)
            .query(`
                SELECT
                    s.schedule_id, s.title, s.start_at, s.end_at, s.location,
                    s.meeting_url, s.delivery_mode, s.course_id, c.course_name
                FROM BD_PTS.dbo.class_schedules s
                LEFT JOIN BD_PTS.dbo.courses_main c ON c.course_id = s.course_id
                WHERE s.schedule_id = @scheduleId AND s.flag_use = 1 AND s.course_id IS NOT NULL
            `);
        const schedule = scheduleResult.recordset[0];
        if (!schedule) return;

        const users = await pool.request()
            .input('courseId', sql.Int, schedule.course_id)
            .query(`
                SELECT e.user_id
                FROM BD_PTS.dbo.course_enrollments e
                INNER JOIN BD_PTS.dbo.google_calendar_links g ON g.user_id = e.user_id
                WHERE e.course_id = @courseId
                  AND ISNULL(e.gcal_notify, 0) = 1
            `);

        for (const row of users.recordset) {
            try {
                await syncOneSchedule(pool, row.user_id, schedule);
                await createNotification(
                    pool,
                    row.user_id,
                    'ตารางเรียนใหม่ในปฏิทิน',
                    `${schedule.title} ถูกเพิ่มลง Google Calendar พร้อมแจ้งเตือน`,
                    'Schedule.html'
                );
            } catch (err) {
                console.warn('[google-calendar] sync to user', row.user_id, err.message);
            }
        }
    } catch (err) {
        console.warn('[google-calendar] syncScheduleToEnrolledUsers:', err.message);
    }
}

async function removeScheduleFromAllCalendars(pool, scheduleId) {
    try {
        const maps = await pool.request()
            .input('scheduleId', sql.Int, scheduleId)
            .query(`
                SELECT user_id, google_event_id
                FROM BD_PTS.dbo.google_calendar_events
                WHERE schedule_id = @scheduleId
            `);
        for (const row of maps.recordset) {
            await deleteOneScheduleEvent(pool, row.user_id, scheduleId);
        }
    } catch (err) {
        console.warn('[google-calendar] removeScheduleFromAllCalendars:', err.message);
    }
}

async function disconnectUser(pool, userId, options = {}) {
    if (options.deleteEvents) {
        const maps = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT schedule_id FROM BD_PTS.dbo.google_calendar_events WHERE user_id = @userId
            `);
        for (const row of maps.recordset) {
            await deleteOneScheduleEvent(pool, userId, row.schedule_id);
        }
    } else {
        await pool.request()
            .input('userId', sql.Int, userId)
            .query(`DELETE FROM BD_PTS.dbo.google_calendar_events WHERE user_id = @userId`);
    }

    await pool.request()
        .input('userId', sql.Int, userId)
        .query(`DELETE FROM BD_PTS.dbo.google_calendar_links WHERE user_id = @userId`);
}

function newOAuthState() {
    return crypto.randomBytes(16).toString('hex');
}

module.exports = {
    isGoogleConfigured,
    publicGoogleStatus,
    diagnoseGoogleSetup,
    getGoogleConfig,
    hydrateGoogleEnvFromLocal,
    buildAuthUrl,
    buildLoginAuthUrl,
    exchangeCode,
    fetchGoogleEmail,
    fetchGoogleProfile,
    saveLink,
    getLink,
    setRemindersEnabled,
    syncUserSchedules,
    syncAfterEnroll,
    syncScheduleToEnrolledUsers,
    removeScheduleFromAllCalendars,
    disconnectUser,
    getCourseNotifyPref,
    setCourseNotifyPref,
    newOAuthState,
    LOGIN_SCOPES
};
