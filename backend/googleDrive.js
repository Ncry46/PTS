/**
 * Google Drive image storage for PTS uploads (avatars, slips, etc.)
 *
 * Auth modes (first match wins):
 *  1) OAuth refresh token of YOUR Google account (recommended for personal Gmail)
 *       GOOGLE_DRIVE_REFRESH_TOKEN=...
 *       or backend/google.drive.token.json
 *       + GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (same as Login)
 *  2) Service Account JSON (often fails on personal My Drive due to zero quota)
 *
 * Always needs:
 *   GOOGLE_DRIVE_FOLDER_ID=...
 *
 * See GOOGLE_DRIVE.md
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const LOCAL_PATH = path.join(__dirname, 'google.local.js');
const DEFAULT_SA_FILE = path.join(__dirname, 'google-service-account.json');
const TOKEN_FILE = path.join(__dirname, 'google.drive.token.json');

function pickNonEmpty(...values) {
    for (const value of values) {
        const s = String(value == null ? '' : value).trim();
        if (s) return s;
    }
    return '';
}

function readLocalGoogle() {
    try {
        if (!fs.existsSync(LOCAL_PATH)) return {};
        delete require.cache[require.resolve('./google.local.js')];
        return require('./google.local.js') || {};
    } catch (_) {
        return {};
    }
}

function getOAuthClient() {
    const local = readLocalGoogle();
    return {
        clientId: pickNonEmpty(process.env.GOOGLE_CLIENT_ID, local.clientId),
        clientSecret: pickNonEmpty(process.env.GOOGLE_CLIENT_SECRET, local.clientSecret),
        redirectUri: pickNonEmpty(
            process.env.GOOGLE_DRIVE_REDIRECT_URI,
            process.env.GOOGLE_REDIRECT_URI,
            local.redirectUri,
            'http://localhost:3000/api/google/oauth/callback'
        )
    };
}

function loadRefreshToken() {
    const local = readLocalGoogle();
    const fromEnv = pickNonEmpty(
        process.env.GOOGLE_DRIVE_REFRESH_TOKEN,
        local.driveRefreshToken
    );
    if (fromEnv) return fromEnv;
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const j = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            return pickNonEmpty(j.refresh_token, j.refreshToken);
        }
    } catch (_) { /* ignore */ }
    return '';
}

function saveRefreshToken(refreshToken, email) {
    const body = {
        refresh_token: String(refreshToken || '').trim(),
        email: email || null,
        saved_at: new Date().toISOString()
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(body, null, 2), 'utf8');
}

function loadServiceAccount() {
    const local = readLocalGoogle();
    if (local.serviceAccount && typeof local.serviceAccount === 'object') {
        return local.serviceAccount;
    }
    const inline = pickNonEmpty(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, local.serviceAccountJson);
    if (inline) {
        try { return JSON.parse(inline); }
        catch (_) { throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ไม่ใช่ JSON ที่ถูกต้อง'); }
    }
    const filePath = pickNonEmpty(
        process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
        local.serviceAccountFile,
        DEFAULT_SA_FILE
    );
    const abs = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath.replace(/^\.\//, ''));
    const candidates = [abs, path.join(__dirname, path.basename(filePath)), DEFAULT_SA_FILE];
    for (const p of candidates) {
        if (p && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    }
    return null;
}

function getDriveFolderId() {
    const local = readLocalGoogle();
    return pickNonEmpty(process.env.GOOGLE_DRIVE_FOLDER_ID, local.driveFolderId);
}

function hasOAuthDrive() {
    const oauth = getOAuthClient();
    return Boolean(oauth.clientId && oauth.clientSecret && loadRefreshToken());
}

function hasServiceAccount() {
    try {
        const sa = loadServiceAccount();
        return Boolean(sa && sa.client_email && sa.private_key);
    } catch (_) {
        return false;
    }
}

function isDriveConfigured() {
    return Boolean(getDriveFolderId() && (hasOAuthDrive() || hasServiceAccount()));
}

function publicDriveStatus() {
    const folder = getDriveFolderId();
    let saEmail = null;
    try { saEmail = loadServiceAccount()?.client_email || null; } catch (_) { /* ignore */ }
    let tokenEmail = null;
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            tokenEmail = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8')).email || null;
        }
    } catch (_) { /* ignore */ }
    const mode = hasOAuthDrive() ? 'oauth' : (hasServiceAccount() ? 'service_account' : 'none');
    return {
        configured: isDriveConfigured(),
        mode,
        folderConfigured: Boolean(folder),
        folderId: folder || null,
        oauthConfigured: hasOAuthDrive(),
        oauthEmail: tokenEmail,
        serviceAccountConfigured: hasServiceAccount(),
        serviceAccountEmail: saEmail,
        hint: !hasOAuthDrive() && hasServiceAccount()
            ? 'บัญชี Gmail ส่วนตัวมักอัปด้วย Service Account ไม่ได้ — รัน node backend/setup-google-drive-oauth.js'
            : null
    };
}

function base64url(input) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
    return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

let cachedToken = { accessToken: '', expiresAt: 0, mode: '' };

async function getAccessTokenOAuth() {
    const oauth = getOAuthClient();
    const refreshToken = loadRefreshToken();
    if (!oauth.clientId || !oauth.clientSecret || !refreshToken) {
        throw new Error('ยังไม่ได้ตั้งค่า Google Drive OAuth refresh token');
    }
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: oauth.clientId,
            client_secret: oauth.clientSecret,
            refresh_token: refreshToken,
            grant_type: 'refresh_token'
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
        throw new Error(data.error_description || data.error || 'รีเฟรช Drive OAuth token ไม่สำเร็จ');
    }
    return data.access_token;
}

async function getAccessTokenServiceAccount() {
    const sa = loadServiceAccount();
    if (!sa?.client_email || !sa?.private_key) {
        throw new Error('ยังไม่ได้ตั้งค่า Google Service Account');
    }
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        iat,
        exp
    }));
    const unsigned = `${header}.${claim}`;
    const key = String(sa.private_key).replace(/\\n/g, '\n');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(unsigned);
    sign.end();
    const signature = base64url(sign.sign(key));
    const jwt = `${unsigned}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
        throw new Error(data.error_description || data.error || 'ขอ Service Account token ไม่สำเร็จ');
    }
    return data.access_token;
}

async function getAccessToken() {
    const now = Date.now();
    if (cachedToken.accessToken && cachedToken.expiresAt > now + 60_000) {
        return { token: cachedToken.accessToken, mode: cachedToken.mode };
    }
    if (hasOAuthDrive()) {
        const token = await getAccessTokenOAuth();
        cachedToken = { accessToken: token, expiresAt: now + 3500_000, mode: 'oauth' };
        return { token, mode: 'oauth' };
    }
    const token = await getAccessTokenServiceAccount();
    cachedToken = { accessToken: token, expiresAt: now + 3500_000, mode: 'service_account' };
    return { token, mode: 'service_account' };
}

function publicViewUrl(fileId) {
    // Serve through our API — direct Drive/lh3 links often break in <img>
    const id = String(fileId || '').trim();
    return id ? `/api/google/drive/file/${encodeURIComponent(id)}` : '';
}

function extractDriveFileId(url) {
    const s = String(url || '');
    let m = s.match(/\/api\/google\/drive\/file\/([^/?#]+)/i);
    if (m) return decodeURIComponent(m[1]);
    m = s.match(/lh3\.googleusercontent\.com\/d\/([^/?#]+)/i);
    if (m) return decodeURIComponent(m[1]);
    m = s.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
    if (m) return decodeURIComponent(m[1]);
    m = s.match(/[?&]id=([^&]+)/i);
    if (m) return decodeURIComponent(m[1]);
    return '';
}

/** Rewrite broken public Drive URLs to the local proxy path. */
function normalizeDriveUrl(url) {
    const id = extractDriveFileId(url);
    if (!id) return url;
    // already proxy
    if (String(url || '').startsWith('/api/google/drive/file/')) return url;
    return publicViewUrl(id);
}

async function makeAnyoneReadable(fileId, accessToken) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn('[drive] permission:', data.error?.message || res.status);
    }
}

async function fetchDriveFile(fileId) {
    const id = String(fileId || '').trim();
    if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        const err = new Error('รหัสไฟล์ Drive ไม่ถูกต้อง');
        err.status = 400;
        throw err;
    }
    const { token: accessToken } = await getAccessToken();
    const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?fields=id,name,mimeType&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const meta = await metaRes.json().catch(() => ({}));
    if (!metaRes.ok) {
        const err = new Error(meta.error?.message || 'ไม่พบไฟล์บน Drive');
        err.status = metaRes.status;
        throw err;
    }
    const mediaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!mediaRes.ok) {
        const err = new Error('ดาวน์โหลดไฟล์จาก Drive ไม่สำเร็จ');
        err.status = mediaRes.status;
        throw err;
    }
    const buf = Buffer.from(await mediaRes.arrayBuffer());
    return {
        buffer: buf,
        mimeType: meta.mimeType || mediaRes.headers.get('content-type') || 'application/octet-stream',
        name: meta.name || id
    };
}

async function uploadImageToDrive({ filePath, buffer, filename, mimeType, folderId }) {
    if (!getDriveFolderId() && !folderId) {
        throw new Error('ยังไม่ได้ตั้งค่า GOOGLE_DRIVE_FOLDER_ID');
    }
    if (!hasOAuthDrive() && !hasServiceAccount()) {
        throw new Error('ยังไม่ได้ตั้งค่า Google Drive auth (OAuth หรือ Service Account)');
    }

    const { token: accessToken, mode } = await getAccessToken();
    const parent = folderId || getDriveFolderId();
    const name = String(filename || `pts-${Date.now()}.jpg`).replace(/[^\w.\-()+@\u0E00-\u0E7F]+/g, '_');
    const mime = mimeType || 'image/jpeg';

    let bodyBuf = buffer;
    if (!bodyBuf && filePath) bodyBuf = fs.readFileSync(filePath);
    if (!bodyBuf) throw new Error('ไม่มีข้อมูลไฟล์สำหรับอัปโหลด');

    const metadata = { name, parents: parent ? [parent] : undefined };
    const boundary = 'pts_drive_' + crypto.randomBytes(8).toString('hex');
    const metaPart = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        'utf8'
    );
    const fileHead = Buffer.from(`--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, 'utf8');
    const end = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const multipart = Buffer.concat([metaPart, fileHead, bodyBuf, end]);

    const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': `multipart/related; boundary=${boundary}`,
                'Content-Length': String(multipart.length)
            },
            body: multipart
        }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
        const msg = data.error?.message || 'อัปโหลดขึ้น Google Drive ไม่สำเร็จ';
        if (/storageQuotaExceeded|Service Accounts do not have storage quota/i.test(msg)) {
            throw new Error(
                'Service Account อัปเข้า My Drive ส่วนตัวไม่ได้ (ไม่มีโควต้า) — รัน node backend/setup-google-drive-oauth.js เพื่อใช้บัญชี Google ของคุณแทน'
            );
        }
        throw new Error(msg);
    }

    await makeAnyoneReadable(data.id, accessToken);

    return {
        ok: true,
        fileId: data.id,
        name: data.name || name,
        url: publicViewUrl(data.id),
        webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
        mode,
        parents: data.parents || []
    };
}

async function tryUploadLocalFile(filePath, opts = {}) {
    if (!isDriveConfigured()) {
        return { ok: false, error: 'Drive ยังไม่พร้อม (ขาด folder id หรือ auth)' };
    }
    try {
        const filename = opts.filename || path.basename(filePath);
        const mimeType = opts.mimeType || guessMime(filename);
        const uploaded = await uploadImageToDrive({
            filePath,
            filename,
            mimeType,
            folderId: opts.folderId
        });
        return uploaded;
    } catch (err) {
        console.warn('[drive] upload fallback local:', err.message);
        return { ok: false, error: err.message };
    }
}

async function probeDriveUpload() {
    const status = publicDriveStatus();
    if (!status.configured) {
        return { ok: false, ...status, error: 'ยัง configured ไม่ครบ' };
    }
    try {
        const buf = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
            'base64'
        );
        const uploaded = await uploadImageToDrive({
            buffer: buf,
            filename: `pts-probe-${Date.now()}.png`,
            mimeType: 'image/png'
        });
        // best-effort delete probe file
        try {
            const { token } = await getAccessToken();
            await fetch(`https://www.googleapis.com/drive/v3/files/${uploaded.fileId}?supportsAllDrives=true`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
        } catch (_) { /* ignore */ }
        return { ok: true, ...status, probed: true, mode: uploaded.mode };
    } catch (err) {
        return { ok: false, ...status, probed: true, error: err.message };
    }
}

function buildDriveAuthUrl(state) {
    const oauth = getOAuthClient();
    if (!oauth.clientId) throw new Error('ยังไม่มี GOOGLE_CLIENT_ID');
    const params = new URLSearchParams({
        client_id: oauth.clientId,
        redirect_uri: oauth.redirectUri,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'consent',
        scope: [
            'https://www.googleapis.com/auth/drive.file',
            'openid',
            'email',
            'profile'
        ].join(' '),
        state: state || 'drive_storage'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function exchangeDriveCode(code) {
    const oauth = getOAuthClient();
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: oauth.clientId,
            client_secret: oauth.clientSecret,
            redirect_uri: oauth.redirectUri,
            grant_type: 'authorization_code'
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.refresh_token) {
        throw new Error(
            data.error_description
            || data.error
            || 'ไม่ได้รับ refresh_token — ลองถอนสิทธิ์แอปแล้ว authorize ใหม่ด้วย prompt=consent'
        );
    }
    let email = null;
    if (data.access_token) {
        try {
            const p = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${data.access_token}` }
            });
            const info = await p.json().catch(() => ({}));
            email = info.email || null;
        } catch (_) { /* ignore */ }
    }
    saveRefreshToken(data.refresh_token, email);
    cachedToken = { accessToken: '', expiresAt: 0, mode: '' };
    return { refresh_token: data.refresh_token, email };
}

function guessMime(name) {
    const ext = String(path.extname(name || '')).toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    return 'application/octet-stream';
}

module.exports = {
    isDriveConfigured,
    publicDriveStatus,
    getDriveFolderId,
    uploadImageToDrive,
    tryUploadLocalFile,
    publicViewUrl,
    extractDriveFileId,
    normalizeDriveUrl,
    fetchDriveFile,
    probeDriveUpload,
    buildDriveAuthUrl,
    exchangeDriveCode,
    saveRefreshToken,
    loadRefreshToken,
    getOAuthClient
};
