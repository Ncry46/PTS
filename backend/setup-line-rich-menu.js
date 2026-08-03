/**
 * Create / replace LINE Rich Menu (2×2) to match PTS OA mock.
 *
 * Usage:
 *   node backend/setup-line-rich-menu.js
 *
 * Requires .env:
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   LINE_LIFF_ID (recommended)
 *   APP_BASE_URL
 *
 * Uploads a generated PNG rich-menu image (2500×1686) via LINE API.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const line = require('./lineMessaging');

function crc32(buf) {
    let c = ~0;
    for (let i = 0; i < buf.length; i++) {
        c ^= buf[i];
        for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
}

function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc >>> 0, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Minimal uncompressed-ish PNG writer (RGB). */
function encodePng(width, height, rgbaFn) {
    const raw = Buffer.alloc((width * 3 + 1) * height);
    for (let y = 0; y < height; y++) {
        const row = y * (width * 3 + 1);
        raw[row] = 0;
        for (let x = 0; x < width; x++) {
            const [r, g, b] = rgbaFn(x, y);
            const i = row + 1 + x * 3;
            raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
        }
    }
    const compressed = zlib.deflateSync(raw, { level: 9 });
    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type RGB
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
        signature,
        chunk('IHDR', ihdr),
        chunk('IDAT', compressed),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

function fillRect(setPx, x0, y0, x1, y1, color) {
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) setPx(x, y, color);
    }
}

function fillCircle(setPx, cx, cy, r, color) {
    const r2 = r * r;
    for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
            const dx = x - cx; const dy = y - cy;
            if (dx * dx + dy * dy <= r2) setPx(x, y, color);
        }
    }
}

function buildRichMenuPng() {
    const W = 2500;
    const H = 1686;
    const px = Buffer.alloc(W * H * 3);
    const setPx = (x, y, [r, g, b]) => {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const i = (y * W + x) * 3;
        px[i] = r; px[i + 1] = g; px[i + 2] = b;
    };
    const getColor = (x, y) => {
        const i = (y * W + x) * 3;
        return [px[i], px[i + 1], px[i + 2]];
    };

    // lavender background + soft dots
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const dot = ((x % 48) < 3 && (y % 48) < 3) ? 8 : 0;
            setPx(x, y, [241 - dot, 232 - dot, 240 - dot]);
        }
    }

    const cells = [
        { x0: 0, y0: 0, x1: 1250, y1: 843, color: [151, 66, 88] },      // courses maroon
        { x0: 1250, y0: 0, x1: 2500, y1: 843, color: [15, 118, 110] },   // register teal
        { x0: 0, y0: 843, x1: 1250, y1: 1686, color: [107, 124, 60] },   // profile olive
        { x0: 1250, y0: 843, x1: 2500, y1: 1686, color: [124, 106, 154] } // help purple
    ];

    cells.forEach((c) => {
        const cx = Math.floor((c.x0 + c.x1) / 2);
        const cy = Math.floor((c.y0 + c.y1) / 2) - 40;
        fillCircle(setPx, cx, cy, 160, [255, 255, 255]);
        fillCircle(setPx, cx, cy, 132, c.color);
        // inner white glyph blob
        fillCircle(setPx, cx, cy, 48, [255, 255, 255]);
    });

    // subtle cell separators
    fillRect(setPx, 1246, 0, 1254, H, [220, 205, 215]);
    fillRect(setPx, 0, 839, W, 847, [220, 205, 215]);

    return encodePng(W, H, (x, y) => getColor(x, y));
}

async function main() {
    if (!line.isMessagingConfigured()) {
        console.error('ตั้ง LINE_CHANNEL_ACCESS_TOKEN และ LINE_CHANNEL_SECRET ใน .env ก่อน');
        process.exit(1);
    }

    const appCourses = line.safeActionUri(null, 'courses') || line.lineAppPath('courses');
    const appMine = line.safeActionUri(null, 'mine') || line.lineAppPath('mine');
    const appProfile = line.safeActionUri(null, 'profile') || line.lineAppPath('profile');
    const coursesPage = line.absoluteUrl('/Courses.html');
    const helpCandidate = line.absoluteUrl('/Settings.html#line-oa');
    const help = (line.isPublicHttpUrl(helpCandidate) ? helpCandidate : '') || appProfile;
    const registerUri = (line.isPublicHttpUrl(coursesPage) ? coursesPage : '') || appCourses;

    if (!line.isPublicHttpUrl(appCourses)) {
        console.error('ต้องตั้ง APP_BASE_URL หรือ LINE_LIFF_ID เป็น https ก่อนสร้าง Rich Menu');
        process.exit(1);
    }

    console.log('Creating rich menu...');
    const created = await line.lineApi('/v2/bot/richmenu', 'POST', {
        size: { width: 2500, height: 1686 },
        selected: true,
        name: 'PTS Learning main menu',
        chatBarText: 'เมนู PTS',
        areas: [
            { bounds: { x: 0, y: 0, width: 1250, height: 843 }, action: { type: 'uri', uri: appCourses } },
            { bounds: { x: 1250, y: 0, width: 1250, height: 843 }, action: { type: 'uri', uri: registerUri } },
            { bounds: { x: 0, y: 843, width: 1250, height: 843 }, action: { type: 'uri', uri: appProfile } },
            { bounds: { x: 1250, y: 843, width: 1250, height: 843 }, action: { type: 'uri', uri: help } }
        ]
    });

    const richMenuId = created.richMenuId;
    console.log('richMenuId =', richMenuId);

    const png = buildRichMenuPng();
    const outPath = path.join(__dirname, '..', 'uploads', 'line-rich-menu.png');
    try { fs.mkdirSync(path.dirname(outPath), { recursive: true }); } catch (_) {}
    fs.writeFileSync(outPath, png);
    console.log('Saved preview:', outPath);

    console.log('Uploading image...');
    const token = line.getChannelAccessToken();
    const up = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'image/png'
        },
        body: png
    });
    if (!up.ok) {
        const t = await up.text();
        throw new Error('upload failed: ' + t);
    }

    console.log('Setting as default...');
    await line.lineApi(`/v2/bot/user/all/richmenu/${richMenuId}`, 'POST', null);
    console.log('Done. Rich menu is live for all users.');
    console.log('Tiles →', { appCourses, appMine, registerUri, appProfile, help });
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
