/**
 * LINE Messaging API helpers (Official Account)
 * Brand colors match PTS: primary #974258
 */
const crypto = require('crypto');
const sql = require('mssql');

const BRAND = {
    primary: '#974258',
    primaryDeep: '#7a2f42',
    soft: '#f6e6ea',
    text: '#1c1520',
    muted: '#5c4f55',
    surface: '#ffffff',
    accent: '#3d5a4c'
};

function getChannelAccessToken() {
    return String(process.env.LINE_CHANNEL_ACCESS_TOKEN || '').trim();
}

function getChannelSecret() {
    return String(process.env.LINE_CHANNEL_SECRET || '').trim();
}

function getChannelId() {
    return String(process.env.LINE_CHANNEL_ID || process.env.LINE_LOGIN_CHANNEL_ID || '').trim();
}

function getLiffId() {
    return String(process.env.LINE_LIFF_ID || '').trim();
}

function getAddFriendUrl() {
    return String(
        process.env.LINE_OA_ADD_FRIEND_URL
        || process.env.LINE_OA_URL
        || ''
    ).trim();
}

function getOaName() {
    return String(process.env.LINE_OA_NAME || 'PTS Learning').trim() || 'PTS Learning';
}

function getAppBaseUrl() {
    const raw = String(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
    return raw || '';
}

function isMessagingConfigured() {
    return Boolean(getChannelAccessToken() && getChannelSecret());
}

function isLiffConfigured() {
    return Boolean(getLiffId());
}

function publicLineStatus() {
    const addFriendUrl = getAddFriendUrl();
    return {
        name: getOaName(),
        addFriendUrl: addFriendUrl || null,
        addFriendConfigured: Boolean(addFriendUrl),
        messagingConfigured: isMessagingConfigured(),
        liffConfigured: isLiffConfigured(),
        liffId: getLiffId() || null,
        channelIdConfigured: Boolean(getChannelId()),
        appUrl: lineAppPath()
    };
}

function lineAppPath() {
    const liffId = getLiffId();
    if (liffId) return `https://liff.line.me/${liffId}`;
    const base = getAppBaseUrl();
    return base ? `${base}/LineApp.html` : '/LineApp.html';
}

function absoluteUrl(pathOrUrl) {
    if (!pathOrUrl) return getAppBaseUrl() || '';
    if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
    const base = getAppBaseUrl();
    const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    return base ? `${base}${path}` : path;
}

function verifySignature(rawBody, signatureHeader) {
    const secret = getChannelSecret();
    if (!secret || !signatureHeader) return false;
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ''), 'utf8');
    const digest = crypto.createHmac('sha256', secret).update(body).digest('base64');
    try {
        return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(String(signatureHeader)));
    } catch (_) {
        return digest === String(signatureHeader);
    }
}

async function lineApi(pathname, method, payload) {
    const token = getChannelAccessToken();
    if (!token) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN');
    const res = await fetch(`https://api.line.me${pathname}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: payload == null ? undefined : JSON.stringify(payload)
    });
    const text = await res.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { raw: text }; }
    if (!res.ok) {
        const msg = data.message || data.error_description || text || `LINE API ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

async function replyMessage(replyToken, messages) {
    if (!replyToken || !messages || !messages.length) return null;
    return lineApi('/v2/bot/message/reply', 'POST', {
        replyToken,
        messages: messages.slice(0, 5)
    });
}

async function pushMessage(lineUserId, messages) {
    if (!lineUserId || !messages || !messages.length) return null;
    return lineApi('/v2/bot/message/push', 'POST', {
        to: lineUserId,
        messages: messages.slice(0, 5)
    });
}

function buildMenuFlex(opts = {}) {
    const appUrl = opts.appUrl || lineAppPath();
    const coursesUrl = opts.coursesUrl || absoluteUrl('/Courses.html');
    const myCoursesUrl = opts.myCoursesUrl || absoluteUrl('/MyCourses.html');
    const scheduleUrl = opts.scheduleUrl || absoluteUrl('/Schedule.html');
    const settingsUrl = opts.settingsUrl || absoluteUrl('/Settings.html#line-oa');
    const name = getOaName();

    return {
        type: 'flex',
        altText: `${name} — เมนูด่วน`,
        contents: {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '20px',
                backgroundColor: BRAND.primary,
                contents: [
                    {
                        type: 'text',
                        text: name,
                        weight: 'bold',
                        size: 'xl',
                        color: '#ffffff'
                    },
                    {
                        type: 'text',
                        text: 'เรียนง่ายใน LINE · คุมธีม PTS',
                        size: 'sm',
                        color: '#ffd7e0',
                        margin: 'md',
                        wrap: true
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                paddingAll: '16px',
                backgroundColor: BRAND.surface,
                contents: [
                    {
                        type: 'text',
                        text: 'เลือกเมนูที่ต้องการ',
                        weight: 'bold',
                        color: BRAND.text,
                        size: 'md'
                    },
                    {
                        type: 'text',
                        text: 'พิมพ์ “เมนู” ได้ทุกเมื่อ หรือกดปุ่มด้านล่าง',
                        size: 'xs',
                        color: BRAND.muted,
                        wrap: true,
                        margin: 'sm'
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                paddingAll: '16px',
                backgroundColor: BRAND.soft,
                contents: [
                    btn('เปิดแอปใน LINE', appUrl, BRAND.primary),
                    btn('คอร์สของฉัน', myCoursesUrl, BRAND.primaryDeep),
                    btn('ตารางเรียน', scheduleUrl, BRAND.accent),
                    btn('ดูหลักสูตร', coursesUrl, BRAND.primary),
                    btn('เชื่อมบัญชี / ตั้งค่า', settingsUrl, BRAND.primaryDeep)
                ]
            },
            styles: {
                header: { backgroundColor: BRAND.primary },
                footer: { separator: false }
            }
        }
    };
}

function btn(label, uri, color) {
    return {
        type: 'button',
        style: 'primary',
        height: 'sm',
        color: color || BRAND.primary,
        action: {
            type: 'uri',
            label,
            uri
        }
    };
}

function buildText(text) {
    return { type: 'text', text: String(text || '').slice(0, 4900) };
}

function buildNotifyFlex(title, body, linkUrl) {
    const contents = [
        {
            type: 'text',
            text: String(title || 'การแจ้งเตือน').slice(0, 80),
            weight: 'bold',
            size: 'md',
            color: BRAND.text,
            wrap: true
        }
    ];
    if (body) {
        contents.push({
            type: 'text',
            text: String(body).slice(0, 200),
            size: 'sm',
            color: BRAND.muted,
            wrap: true,
            margin: 'md'
        });
    }
    const footerContents = [];
    if (linkUrl) {
        footerContents.push(btn('เปิดดู', absoluteUrl(linkUrl), BRAND.primary));
    }
    footerContents.push(btn('เปิดแอป PTS', lineAppPath(), BRAND.primaryDeep));

    return {
        type: 'flex',
        altText: String(title || 'PTS Learning').slice(0, 100),
        contents: {
            type: 'bubble',
            header: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '16px',
                backgroundColor: BRAND.primary,
                contents: [
                    {
                        type: 'text',
                        text: getOaName(),
                        color: '#ffffff',
                        weight: 'bold',
                        size: 'sm'
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '16px',
                backgroundColor: BRAND.surface,
                contents
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                spacing: 'sm',
                paddingAll: '12px',
                backgroundColor: BRAND.soft,
                contents: footerContents
            }
        }
    };
}

async function verifyIdToken(idToken) {
    const clientId = getChannelId();
    if (!clientId) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ID');
    if (!idToken) throw new Error('ไม่พบ LINE id token');

    const params = new URLSearchParams();
    params.set('id_token', idToken);
    params.set('client_id', clientId);
    const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(data.error_description || data.message || 'ยืนยัน LINE token ไม่สำเร็จ');
    }
    return data; // { sub, name, picture, email?, ... }
}

async function fetchProfileByAccessToken(accessToken) {
    const res = await fetch('https://api.line.me/v2/profile', {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'โหลดโปรไฟล์ LINE ไม่สำเร็จ');
    return data;
}

async function getLinkedLineUserId(pool, userId) {
    const result = await pool.request()
        .input('userId', sql.Int, userId)
        .query(`
            SELECT line_user_id
            FROM BD_PTS.dbo.line_account_links
            WHERE user_id = @userId
        `);
    return result.recordset[0]?.line_user_id || null;
}

async function pushToUser(pool, userId, title, body, linkUrl) {
    if (!isMessagingConfigured()) return { skipped: true, reason: 'messaging_not_configured' };
    const lineUserId = await getLinkedLineUserId(pool, userId);
    if (!lineUserId) return { skipped: true, reason: 'not_linked' };
    await pushMessage(lineUserId, [buildNotifyFlex(title, body, linkUrl)]);
    return { ok: true };
}

module.exports = {
    BRAND,
    getChannelAccessToken,
    getChannelSecret,
    getChannelId,
    getLiffId,
    getAddFriendUrl,
    getOaName,
    getAppBaseUrl,
    isMessagingConfigured,
    isLiffConfigured,
    publicLineStatus,
    lineAppPath,
    absoluteUrl,
    verifySignature,
    replyMessage,
    pushMessage,
    buildMenuFlex,
    buildText,
    buildNotifyFlex,
    verifyIdToken,
    fetchProfileByAccessToken,
    getLinkedLineUserId,
    pushToUser
};
