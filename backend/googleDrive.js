/**
 * Google Drive image storage for PTS uploads (avatars, banners, etc.)
 *
 * Config (any of):
 *   .env
 *     GOOGLE_DRIVE_FOLDER_ID=
 *     GOOGLE_SERVICE_ACCOUNT_FILE=backend/google-service-account.json
 *     (or GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}')
 *   backend/google.local.js
 *     driveFolderId, serviceAccountFile / serviceAccount
 *
 * Setup: see GOOGLE_DRIVE.md
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');

const LOCAL_PATH = path.join(__dirname, 'google.local.js');
const DEFAULT_SA_FILE = path.join(__dirname, 'google-service-account.json');

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

function loadServiceAccount() {
    const local = readLocalGoogle();
    if (local.serviceAccount && typeof local.serviceAccount === 'object') {
        return local.serviceAccount;
    }

    const inline = pickNonEmpty(process.env.GOOGLE_SERVICE_ACCOUNT_JSON, local.serviceAccountJson);
    if (inline) {
        try {
            return JSON.parse(inline);
        } catch (err) {
            throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON ไม่ใช่ JSON ที่ถูกต้อง');
        }
    }

    const filePath = pickNonEmpty(
        process.env.GOOGLE_SERVICE_ACCOUNT_FILE,
        local.serviceAccountFile,
        DEFAULT_SA_FILE
    );
    const abs = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath.replace(/^\.\//, ''));
    // also allow backend-relative
    const candidates = [
        abs,
        path.join(__dirname, path.basename(filePath)),
        path.join(__dirname, 'google-service-account.json')
    ];
    for (const p of candidates) {
        if (p && fs.existsSync(p)) {
            return JSON.parse(fs.readFileSync(p, 'utf8'));
        }
    }
    return null;
}

function getDriveFolderId() {
    const local = readLocalGoogle();
    return pickNonEmpty(process.env.GOOGLE_DRIVE_FOLDER_ID, local.driveFolderId);
}

function isDriveConfigured() {
    try {
        const sa = loadServiceAccount();
        const folder = getDriveFolderId();
        return Boolean(sa && sa.client_email && sa.private_key && folder);
    } catch (_) {
        return false;
    }
}

function publicDriveStatus() {
    const folder = getDriveFolderId();
    let saEmail = null;
    try {
        const sa = loadServiceAccount();
        saEmail = sa?.client_email || null;
    } catch (_) { /* ignore */ }
    return {
        configured: isDriveConfigured(),
        folderConfigured: Boolean(folder),
        serviceAccountConfigured: Boolean(saEmail),
        serviceAccountEmail: saEmail
    };
}

function base64url(input) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
    return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

let cachedToken = { accessToken: '', expiresAt: 0 };

async function getAccessToken() {
    const now = Date.now();
    if (cachedToken.accessToken && cachedToken.expiresAt > now + 60_000) {
        return cachedToken.accessToken;
    }

    const sa = loadServiceAccount();
    if (!sa?.client_email || !sa?.private_key) {
        throw new Error('ยังไม่ได้ตั้งค่า Google Service Account');
    }

    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + 3600;
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = base64url(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/drive.file',
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
        throw new Error(data.error_description || data.error || 'ขอ Google Drive token ไม่สำเร็จ');
    }
    cachedToken = {
        accessToken: data.access_token,
        expiresAt: Date.now() + (Number(data.expires_in || 3600) * 1000)
    };
    return cachedToken.accessToken;
}

function publicViewUrl(fileId) {
    return `https://lh3.googleusercontent.com/d/${fileId}`;
}

async function makeAnyoneReadable(fileId, accessToken) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            role: 'reader',
            type: 'anyone'
        })
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        // still usable for account that owns it; warn only
        console.warn('[drive] permission:', data.error?.message || res.status);
    }
}

/**
 * Upload a local file buffer/path to Google Drive.
 * @returns {{ ok: true, fileId: string, url: string, name: string }}
 */
async function uploadImageToDrive({ filePath, buffer, filename, mimeType, folderId }) {
    if (!isDriveConfigured()) {
        throw new Error('ยังไม่ได้ตั้งค่า Google Drive (service account + folder id)');
    }
    const accessToken = await getAccessToken();
    const parent = folderId || getDriveFolderId();
    const name = String(filename || `pts-${Date.now()}.jpg`).replace(/[^\w.\-()+@\u0E00-\u0E7F]+/g, '_');
    const mime = mimeType || 'image/jpeg';

    let bodyBuf = buffer;
    if (!bodyBuf && filePath) bodyBuf = fs.readFileSync(filePath);
    if (!bodyBuf) throw new Error('ไม่มีข้อมูลไฟล์สำหรับอัปโหลด');

    const metadata = {
        name,
        parents: parent ? [parent] : undefined
    };
    const boundary = 'pts_drive_' + crypto.randomBytes(8).toString('hex');
    const metaPart = Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
        'utf8'
    );
    const fileHead = Buffer.from(
        `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
        'utf8'
    );
    const end = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
    const multipart = Buffer.concat([metaPart, fileHead, bodyBuf, end]);

    const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink,webContentLink',
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
        throw new Error(data.error?.message || 'อัปโหลดขึ้น Google Drive ไม่สำเร็จ');
    }

    await makeAnyoneReadable(data.id, accessToken);

    return {
        ok: true,
        fileId: data.id,
        name: data.name || name,
        url: publicViewUrl(data.id),
        webViewLink: data.webViewLink || null
    };
}

/** Try Drive first; on failure return null so caller can keep local file. */
async function tryUploadLocalFile(filePath, opts = {}) {
    if (!isDriveConfigured()) return null;
    try {
        const filename = opts.filename || path.basename(filePath);
        const mimeType = opts.mimeType || guessMime(filename);
        return await uploadImageToDrive({
            filePath,
            filename,
            mimeType,
            folderId: opts.folderId
        });
    } catch (err) {
        console.warn('[drive] upload fallback local:', err.message);
        return null;
    }
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
    publicViewUrl
};
