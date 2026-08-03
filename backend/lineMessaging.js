/**
 * LINE Messaging API helpers (Official Account)
 * Brand colors match PTS mock: maroon #974258 + soft lavender chat feel
 */
const crypto = require('crypto');
const sql = require('mssql');

const BRAND = {
    primary: '#974258',
    primaryDeep: '#7a2f42',
    soft: '#f6e6ea',
    lavender: '#f1e8f0',
    text: '#1c1520',
    muted: '#5c4f55',
    surface: '#ffffff',
    accent: '#3d5a4c',
    teal: '#0f766e',
    olive: '#6b7c3c',
    purple: '#7c6a9a',
    success: '#16a34a'
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

function lineAppPath(hash) {
    const liffId = getLiffId();
    const suffix = hash ? `#${hash.replace(/^#/, '')}` : '';
    if (liffId) return `https://liff.line.me/${liffId}${suffix}`;
    const base = getAppBaseUrl();
    const path = `/LineApp.html${suffix}`;
    return base ? `${base}${path}` : path;
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

async function lineApi(pathname, method, payload, rawBody) {
    const token = getChannelAccessToken();
    if (!token) throw new Error('ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN');
    const headers = { Authorization: `Bearer ${token}` };
    let body;
    if (rawBody != null) {
        body = rawBody;
        if (!headers['Content-Type'] && Buffer.isBuffer(rawBody)) {
            headers['Content-Type'] = 'image/png';
        }
    } else if (payload != null) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(payload);
    }
    const res = await fetch(`https://api.line.me${pathname}`, { method, headers, body });
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

function btn(label, uri, color) {
    return {
        type: 'button',
        style: 'primary',
        height: 'sm',
        color: color || BRAND.primary,
        action: { type: 'uri', label: String(label).slice(0, 40), uri }
    };
}

function buildText(text) {
    return { type: 'text', text: String(text || '').slice(0, 4900) };
}

/** Main branded menu — 2×2 style like the mock rich menu */
function buildMenuFlex(opts = {}) {
    const name = getOaName();
    const courses = opts.coursesUrl || lineAppPath('courses');
    const register = opts.registerUrl || lineAppPath('courses');
    const profile = opts.profileUrl || lineAppPath('profile');
    const help = opts.helpUrl || absoluteUrl('/Settings.html#line-oa');

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
                        text: 'Personal Assistant Academy',
                        size: 'xs',
                        color: '#ffd7e0',
                        margin: 'sm'
                    },
                    {
                        type: 'text',
                        text: 'เลือกเมนูด้านล่างเพื่อเริ่มใช้งาน',
                        size: 'sm',
                        color: '#ffe8ee',
                        margin: 'md',
                        wrap: true
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '14px',
                backgroundColor: BRAND.lavender,
                spacing: '10px',
                contents: [
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: '10px',
                        contents: [
                            menuTile('คอร์สเรียน', 'ดูรายการหลักสูตร', courses, BRAND.primary),
                            menuTile('สมัครเรียน', 'เปิดรายละเอียดคอร์ส', register, BRAND.teal)
                        ]
                    },
                    {
                        type: 'box',
                        layout: 'horizontal',
                        spacing: '10px',
                        contents: [
                            menuTile('โปรไฟล์', 'เชื่อมบัญชี / ตั้งค่า', profile, BRAND.olive),
                            menuTile('ช่วยเหลือ', 'การเชื่อมต่อ LINE', help, BRAND.purple)
                        ]
                    }
                ]
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '12px',
                backgroundColor: BRAND.surface,
                contents: [
                    btn('เปิดแอปใน LINE', lineAppPath('courses'), BRAND.primary)
                ]
            }
        }
    };
}

function menuTile(title, subtitle, uri, color) {
    return {
        type: 'box',
        layout: 'vertical',
        flex: 1,
        backgroundColor: BRAND.surface,
        cornerRadius: '16px',
        paddingAll: '14px',
        action: { type: 'uri', uri },
        contents: [
            {
                type: 'box',
                layout: 'vertical',
                width: '36px',
                height: '36px',
                cornerRadius: '18px',
                backgroundColor: color,
                contents: [
                    {
                        type: 'text',
                        text: ' ',
                        size: 'xs'
                    }
                ]
            },
            {
                type: 'text',
                text: title,
                weight: 'bold',
                size: 'sm',
                color: BRAND.text,
                margin: '10px'
            },
            {
                type: 'text',
                text: subtitle,
                size: 'xxs',
                color: BRAND.muted,
                wrap: true,
                margin: '4px'
            }
        ]
    };
}

/** Payment / general notification card like the mock */
function buildNotifyFlex(title, body, linkUrl) {
    const contents = [
        {
            type: 'text',
            text: String(title || 'การแจ้งเตือน').slice(0, 80),
            weight: 'bold',
            size: 'lg',
            color: BRAND.primary,
            wrap: true
        }
    ];
    if (body) {
        contents.push({
            type: 'text',
            text: String(body).slice(0, 220),
            size: 'sm',
            color: BRAND.muted,
            wrap: true,
            margin: 'md'
        });
    }

    const heroUrl = String(process.env.LINE_FLEX_HERO_IMAGE || '').trim()
        || absoluteUrl('/logo.png');

    const bubble = {
        type: 'bubble',
        size: 'mega',
        hero: heroUrl ? {
            type: 'image',
            url: heroUrl.startsWith('http') ? heroUrl : absoluteUrl(heroUrl),
            size: 'full',
            aspectRatio: '20:13',
            aspectMode: 'cover'
        } : undefined,
        body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '18px',
            backgroundColor: BRAND.surface,
            contents
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '14px',
            backgroundColor: BRAND.soft,
            contents: [
                linkUrl
                    ? btn('ชำระเงินตอนนี้', absoluteUrl(linkUrl), BRAND.primary)
                    : btn('เปิดดูรายละเอียด', lineAppPath('courses'), BRAND.primary),
                btn('เปิดแอป PTS', lineAppPath('courses'), BRAND.primaryDeep)
            ]
        }
    };
    if (!bubble.hero) delete bubble.hero;

    // Soften CTA label when not payment-related
    const t = String(title || '');
    if (!/ชำระ|จ่าย|payment|pay/i.test(t) && bubble.footer.contents[0]) {
        bubble.footer.contents[0] = btn(
            linkUrl ? 'เปิดดูรายละเอียด' : 'ดูหลักสูตร',
            linkUrl ? absoluteUrl(linkUrl) : lineAppPath('courses'),
            BRAND.primary
        );
    }

    return {
        type: 'flex',
        altText: String(title || 'PTS Learning').slice(0, 100),
        contents: bubble
    };
}

function buildSuccessFlex(title, rows) {
    const bodyContents = [
        {
            type: 'box',
            layout: 'horizontal',
            spacing: '12px',
            contents: [
                {
                    type: 'box',
                    layout: 'vertical',
                    width: '40px',
                    height: '40px',
                    cornerRadius: '20px',
                    backgroundColor: '#dcfce7',
                    justifyContent: 'center',
                    alignItems: 'center',
                    contents: [
                        { type: 'text', text: 'OK', weight: 'bold', size: 'sm', color: BRAND.success, align: 'center' }
                    ]
                },
                {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    contents: [
                        {
                            type: 'text',
                            text: String(title || 'สำเร็จ').slice(0, 60),
                            weight: 'bold',
                            size: 'md',
                            color: BRAND.text,
                            wrap: true
                        }
                    ]
                }
            ]
        }
    ];

    (rows || []).forEach((row) => {
        bodyContents.push({
            type: 'box',
            layout: 'baseline',
            spacing: '8px',
            margin: '12px',
            contents: [
                { type: 'text', text: String(row.label || ''), size: 'xs', color: BRAND.muted, flex: 2, wrap: true },
                { type: 'text', text: String(row.value || ''), size: 'xs', color: BRAND.text, flex: 3, wrap: true, weight: 'bold' }
            ]
        });
    });

    return {
        type: 'flex',
        altText: String(title || 'สำเร็จ').slice(0, 100),
        contents: {
            type: 'bubble',
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '18px',
                backgroundColor: BRAND.surface,
                contents: bodyContents
            },
            footer: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '12px',
                backgroundColor: BRAND.lavender,
                contents: [btn('กลับไปยังคอร์สเรียน', lineAppPath('courses'), BRAND.primary)]
            }
        }
    };
}

function buildCourseBubble(course) {
    const id = course.course_id || course.id;
    const name = String(course.course_name || course.title || 'หลักสูตร').slice(0, 80);
    const instructor = String(course.instructor_name || 'PTS Instructor').slice(0, 40);
    const hours = Number(course.total_hours || 0);
    const price = Number(course.price || 0);
    const mode = String(course.delivery_mode || 'course');
    const img = course.cover_image_url
        ? absoluteUrl(course.cover_image_url)
        : 'https://placehold.co/800x520/f8e8ec/974258?text=PTS+Course';
    const detailUrl = absoluteUrl(`CourseDetail.html?courseId=${id}`);
    const badge = Number(course.is_featured) === 1 ? 'BEST SELLER' : mode.toUpperCase();

    return {
        type: 'bubble',
        size: 'kilo',
        hero: {
            type: 'image',
            url: img,
            size: 'full',
            aspectRatio: '20:13',
            aspectMode: 'cover',
            action: { type: 'uri', uri: detailUrl }
        },
        body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '14px',
            contents: [
                {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                        {
                            type: 'box',
                            layout: 'vertical',
                            backgroundColor: Number(course.is_featured) === 1 ? BRAND.primary : BRAND.teal,
                            cornerRadius: '999px',
                            paddingAll: '4px',
                            paddingStart: '8px',
                            paddingEnd: '8px',
                            contents: [
                                { type: 'text', text: badge.slice(0, 16), size: 'xxs', color: '#ffffff', weight: 'bold' }
                            ]
                        }
                    ]
                },
                {
                    type: 'text',
                    text: name,
                    weight: 'bold',
                    size: 'md',
                    color: BRAND.text,
                    wrap: true,
                    maxLines: 2
                },
                {
                    type: 'box',
                    layout: 'baseline',
                    spacing: '6px',
                    contents: [
                        { type: 'text', text: instructor, size: 'xs', color: BRAND.muted, flex: 1, wrap: true },
                        { type: 'text', text: hours ? `${hours} ชม.` : '-', size: 'xs', color: BRAND.muted }
                    ]
                },
                {
                    type: 'text',
                    text: price ? `฿ ${price.toLocaleString('th-TH')}` : 'สอบถามราคา',
                    weight: 'bold',
                    size: 'lg',
                    color: BRAND.primary,
                    margin: 'md'
                }
            ]
        },
        footer: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '12px',
            contents: [
                {
                    type: 'button',
                    style: 'secondary',
                    height: 'sm',
                    color: BRAND.soft,
                    action: { type: 'uri', label: 'รายละเอียด', uri: detailUrl }
                }
            ]
        }
    };
}

function buildCourseCarousel(courses) {
    const bubbles = (courses || []).slice(0, 10).map(buildCourseBubble);
    if (!bubbles.length) {
        return buildMenuFlex();
    }
    return {
        type: 'flex',
        altText: 'รายการหลักสูตร PTS',
        contents: {
            type: 'carousel',
            contents: bubbles
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
    return data;
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
    lineApi,
    replyMessage,
    pushMessage,
    buildMenuFlex,
    buildText,
    buildNotifyFlex,
    buildSuccessFlex,
    buildCourseBubble,
    buildCourseCarousel,
    verifyIdToken,
    fetchProfileByAccessToken,
    getLinkedLineUserId,
    pushToUser
};
