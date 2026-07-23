const fs = require('fs');
const path = require('path');

const SECRETS_PATH = path.join(__dirname, 'mail.secrets.json');
const LOCAL_PATH = path.join(__dirname, 'mail.local.js');

function readLocalMail() {
    try {
        if (!fs.existsSync(LOCAL_PATH)) return {};
        // clear require cache so Admin/env updates + file edits reload on next request
        delete require.cache[require.resolve('./mail.local.js')];
        return require('./mail.local.js') || {};
    } catch (e) {
        console.error('⚠️ อ่าน mail.local.js ไม่ได้:', e.message);
        return {};
    }
}

function readSecretsFile() {
    try {
        if (!fs.existsSync(SECRETS_PATH)) return {};
        const raw = fs.readFileSync(SECRETS_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (e) {
        console.error('⚠️ อ่าน mail.secrets.json ไม่ได้:', e.message);
        return {};
    }
}

function writeSecretsFile(data) {
    const current = readSecretsFile();
    const next = {
        mode: data.mode != null ? data.mode : (current.mode || 'smtp'),
        smtpHost: data.smtpHost != null ? data.smtpHost : (current.smtpHost || 'smtp.gmail.com'),
        smtpPort: data.smtpPort != null ? Number(data.smtpPort) : Number(current.smtpPort || 587),
        smtpSecure: data.smtpSecure != null ? !!data.smtpSecure : !!current.smtpSecure,
        smtpUser: data.smtpUser != null ? data.smtpUser : (current.smtpUser || ''),
        smtpPass: data.smtpPass != null && String(data.smtpPass).length
            ? data.smtpPass
            : (current.smtpPass || ''),
        brevoApiKey: data.brevoApiKey != null && String(data.brevoApiKey).length
            ? data.brevoApiKey
            : (current.brevoApiKey || ''),
        fromName: data.fromName != null ? data.fromName : (current.fromName || 'PTS Learning'),
        fromEmail: data.fromEmail != null ? data.fromEmail : (current.fromEmail || '')
    };
    fs.writeFileSync(SECRETS_PATH, JSON.stringify(next, null, 2), 'utf8');

    // sync กลับไป mail.local.js ให้แก้ที่เดียวก็ได้
    try {
        const passLine = next.smtpPass
            ? JSON.stringify(next.smtpPass)
            : "''";
        const brevoLine = next.brevoApiKey
            ? JSON.stringify(next.brevoApiKey)
            : "''";
        const content = `/**
 * ตั้งค่าส่ง Email OTP จริง — อัปเดตอัตโนมัติจาก Admin หรือแก้มือได้
 * thanvasu.com ใช้ Google Workspace → smtp.gmail.com + App Password
 */
module.exports = {
    mode: ${JSON.stringify(next.mode || 'smtp')},
    smtpHost: ${JSON.stringify(next.smtpHost || 'smtp.gmail.com')},
    smtpPort: ${Number(next.smtpPort || 587)},
    smtpSecure: ${next.smtpSecure ? 'true' : 'false'},
    smtpUser: ${JSON.stringify(next.smtpUser || '')},
    smtpPass: ${passLine},
    fromName: ${JSON.stringify(next.fromName || 'PTS Learning')},
    fromEmail: ${JSON.stringify(next.fromEmail || '')},
    brevoApiKey: ${brevoLine}
};
`;
        fs.writeFileSync(LOCAL_PATH, content, 'utf8');
        delete require.cache[require.resolve('./mail.local.js')];
    } catch (e) {
        console.error('⚠️ sync mail.local.js:', e.message);
    }

    return next;
}

function pick(...values) {
    for (const v of values) {
        if (v == null) continue;
        const s = String(v).trim();
        if (s.length) return s;
    }
    return '';
}

function getMergedMailSettings() {
    const local = readLocalMail();
    const file = readSecretsFile();

    const smtpUser = pick(process.env.SMTP_USER, file.smtpUser, local.smtpUser);
    const smtpPass = pick(process.env.SMTP_PASS, file.smtpPass, local.smtpPass);
    const fromEmail = pick(
        process.env.MAIL_FROM_EMAIL,
        process.env.MAIL_FROM,
        file.fromEmail,
        local.fromEmail,
        smtpUser
    );

    return {
        mode: pick(process.env.MAIL_MODE, file.mode, local.mode, 'smtp') || 'smtp',
        smtp: {
            host: pick(process.env.SMTP_HOST, file.smtpHost, local.smtpHost, 'smtp.gmail.com') || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT || file.smtpPort || local.smtpPort || 587),
            secure: process.env.SMTP_SECURE === 'true' || !!(file.smtpSecure || local.smtpSecure),
            user: smtpUser,
            pass: smtpPass
        },
        brevoApiKey: pick(process.env.BREVO_API_KEY, file.brevoApiKey, local.brevoApiKey),
        fromName: pick(process.env.MAIL_FROM_NAME, file.fromName, local.fromName, 'PTS Learning') || 'PTS Learning',
        fromEmail,
        requireRealDelivery: process.env.EMAIL_OTP_ALLOW_CONSOLE !== 'true',
        secretsFileExists: fs.existsSync(SECRETS_PATH),
        localFileExists: fs.existsSync(LOCAL_PATH)
    };
}

function publicMailStatus() {
    const s = getMergedMailSettings();
    return {
        mode: s.mode,
        smtpConfigured: !!(s.smtp.host && s.smtp.user && s.smtp.pass),
        brevoConfigured: !!String(s.brevoApiKey || '').trim(),
        fromEmail: s.fromEmail || null,
        fromName: s.fromName,
        smtpHost: s.smtp.host,
        smtpUser: s.smtp.user ? `${s.smtp.user.slice(0, 2)}***` : null,
        ready: !!(
            (s.smtp.host && s.smtp.user && s.smtp.pass) ||
            String(s.brevoApiKey || '').trim()
        ),
        secretsFileExists: s.secretsFileExists,
        localFileExists: s.localFileExists,
        setupHint: s.smtp.pass
            ? null
            : 'ใส่ App Password ที่ backend/mail.local.js → smtpPass (Google Workspace ของ thanvasu.com)'
    };
}

module.exports = {
    SECRETS_PATH,
    LOCAL_PATH,
    readSecretsFile,
    readLocalMail,
    writeSecretsFile,
    getMergedMailSettings,
    publicMailStatus
};
