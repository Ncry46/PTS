/**
 * เขียน backend/google.local.js แบบ UTF-8 ถูกต้อง (กัน PowerShell เขียน UTF-16)
 * และอัปเดตคีย์ GOOGLE_* ในไฟล์ .env (ถ้ามี)
 *
 * ใช้:
 *   node backend/write-google-local.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET
 *   node backend/write-google-local.js --from path/to/friends-google.local.js
 *   node backend/write-google-local.js   # ซ่อมไฟล์เดิม / ดึงจาก .env แล้วเขียน UTF-8 ใหม่
 */
const fs = require('fs');
const path = require('path');

try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) { /* optional */ }

const out = path.join(__dirname, 'google.local.js');
const envPath = path.join(__dirname, '..', '.env');

function readLocalFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) return {};
        const buf = fs.readFileSync(filePath);
        let text;
        if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) text = buf.toString('utf16le');
        else if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
            const swapped = Buffer.alloc(buf.length - 2);
            for (let i = 2; i + 1 < buf.length; i += 2) {
                swapped[i - 2] = buf[i + 1];
                swapped[i - 1] = buf[i];
            }
            text = swapped.toString('utf16le');
        } else {
            text = buf.toString('utf8').replace(/^\uFEFF/, '');
        }
        const match = text.match(/module\.exports\s*=\s*(\{[\s\S]*\})\s*;?\s*$/);
        if (match) {
            // eslint-disable-next-line no-new-func
            return Function('"use strict"; return (' + match[1] + ')')() || {};
        }
        // fallback require only for our own out file
        if (path.resolve(filePath) === path.resolve(out)) {
            delete require.cache[require.resolve('./google.local.js')];
            return require('./google.local.js') || {};
        }
        return {};
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

const args = process.argv.slice(2);
let fromPath = '';
const positional = [];
for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--from' && args[i + 1]) {
        fromPath = args[i + 1];
        i += 1;
    } else {
        positional.push(args[i]);
    }
}

const imported = fromPath ? readLocalFile(path.resolve(fromPath)) : {};
if (fromPath && !imported.clientId) {
    console.error('อ่านไฟล์ไม่สำเร็จหรือไม่มี clientId:', path.resolve(fromPath));
    process.exit(1);
}

const existing = readLocalFile(out);
const clientId = String(
    positional[0] || imported.clientId || process.env.GOOGLE_CLIENT_ID || existing.clientId || ''
).trim();
const clientSecret = String(
    positional[1] || imported.clientSecret || process.env.GOOGLE_CLIENT_SECRET || existing.clientSecret || ''
).trim();
const appBaseUrl = String(
    imported.appBaseUrl || process.env.APP_BASE_URL || existing.appBaseUrl || 'http://localhost:3000'
).replace(/\/$/, '');
const redirectUri = String(
    imported.redirectUri || process.env.GOOGLE_REDIRECT_URI || existing.redirectUri || `${appBaseUrl}/api/google/oauth/callback`
).trim();

if (!clientId || !clientSecret) {
    console.error('ยังไม่มี Client ID/Secret บนเครื่องนี้');
    console.error('');
    console.error('เพื่อนรันได้เพราะเขามีไฟล์ลับที่ git ไม่ส่งมา — แก้ได้ดังนี้:');
    console.error('  node backend/write-google-local.js --from พาธ\\google.local.jsของเพื่อน');
    console.error('  node backend/write-google-local.js <CLIENT_ID> <CLIENT_SECRET>');
    console.error('แล้วรัน: npm run google:check && npm start');
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
} else {
    const starter = `# auto-written by write-google-local.js
APP_BASE_URL=${appBaseUrl}
GOOGLE_CLIENT_ID=${clientId}
GOOGLE_CLIENT_SECRET=${clientSecret}
GOOGLE_REDIRECT_URI=${redirectUri}
`;
    fs.writeFileSync(envPath, starter, { encoding: 'utf8' });
    console.log('Created', envPath, '(กรอกค่า DB ในไฟล์นี้ด้วยถ้ายังไม่มี)');
}

console.log('');
console.log('ต่อไป: npm run google:check && npm start');
console.log('แล้วเปิด Settings → เชื่อมต่อ Google Calendar');
