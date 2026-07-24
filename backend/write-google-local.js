/**
 * เขียน backend/google.local.js แบบ UTF-8 ถูกต้อง (กัน PowerShell เขียน UTF-16)
 * และอัปเดตคีย์ GOOGLE_* ในไฟล์ .env (ถ้ามี)
 *
 * ใช้:
 *   node backend/write-google-local.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET
 *   node backend/write-google-local.js   # ซ่อมไฟล์เดิม / ดึงจาก .env แล้วเขียน UTF-8 ใหม่
 */
const fs = require('fs');
const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) { /* optional */ }

const out = path.join(__dirname, 'google.local.js');
const envPath = path.join(__dirname, '..', '.env');

function readExistingLocal() {
    try {
        if (!fs.existsSync(out)) return {};
        const buf = fs.readFileSync(out);
        let text;
        if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString('utf16le');
        else text = buf.toString('utf8').replace(/^\uFEFF/, '');
        const match = text.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
        if (match) {
            // eslint-disable-next-line no-new-func
            return Function('"use strict"; return (' + match[1] + ')')() || {};
        }
        delete require.cache[require.resolve('./google.local.js')];
        return require('./google.local.js') || {};
    } catch (_) {
        return {};
    }
}

function upsertEnvKey(src, key, value) {
    if (!value) return src;
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, 'm');
    if (re.test(src)) return src.replace(re, line);
    const marker = '# —— Google Calendar';
    if (src.includes(marker)) {
        return src.replace(marker, `${marker}\n${line}`);
    }
    return `${src.trimEnd()}\n\n${line}\n`;
}

const existing = readExistingLocal();
const clientId = String(
    process.argv[2] || process.env.GOOGLE_CLIENT_ID || existing.clientId || ''
).trim();
const clientSecret = String(
    process.argv[3] || process.env.GOOGLE_CLIENT_SECRET || existing.clientSecret || ''
).trim();
const appBaseUrl = String(
    process.env.APP_BASE_URL || existing.appBaseUrl || 'http://localhost:3000'
).replace(/\/$/, '');
const redirectUri = String(
    process.env.GOOGLE_REDIRECT_URI || existing.redirectUri || `${appBaseUrl}/api/google/oauth/callback`
).trim();

if (!clientId || !clientSecret) {
    console.error('ยังไม่มี Client ID/Secret');
    console.error('ใช้แบบนี้: node backend/write-google-local.js <CLIENT_ID> <CLIENT_SECRET>');
    console.error('หรือใส่ GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET ในไฟล์ .env แล้วรันคำสั่งนี้อีกครั้งโดยไม่ใส่ argument');
    process.exit(1);
}

const body = `module.exports = {
    clientId: ${JSON.stringify(clientId)},
    clientSecret: ${JSON.stringify(clientSecret)},
    redirectUri: ${JSON.stringify(redirectUri)},
    appBaseUrl: ${JSON.stringify(appBaseUrl)}
};
`;
fs.writeFileSync(out, body, { encoding: 'utf8' });
console.log('Wrote', out);
console.log('clientId hint:', clientId.slice(0, 16) + '…');
console.log('redirectUri:', redirectUri);

if (fs.existsSync(envPath)) {
    let envText = fs.readFileSync(envPath, 'utf8');
    envText = upsertEnvKey(envText, 'GOOGLE_CLIENT_ID', clientId);
    envText = upsertEnvKey(envText, 'GOOGLE_CLIENT_SECRET', clientSecret);
    envText = upsertEnvKey(envText, 'GOOGLE_REDIRECT_URI', redirectUri);
    if (appBaseUrl) envText = upsertEnvKey(envText, 'APP_BASE_URL', appBaseUrl);
    fs.writeFileSync(envPath, envText, { encoding: 'utf8' });
    console.log('Updated', envPath, '(GOOGLE_* keys)');
}

console.log('ต่อไป: รีสตาร์ทเซิร์ฟเวอร์ (npm start) แล้วเปิด Settings → เชื่อมต่อ Google Calendar');
