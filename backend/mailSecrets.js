const fs = require('fs');
const path = require('path');

const SECRETS_PATH = path.join(__dirname, 'mail.secrets.json');

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
        mode: data.mode != null ? data.mode : (current.mode || 'auto'),
        smtpHost: data.smtpHost != null ? data.smtpHost : (current.smtpHost || ''),
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
    return next;
}

function getMergedMailSettings() {
    const file = readSecretsFile();
    return {
        mode: process.env.MAIL_MODE || file.mode || 'auto',
        smtp: {
            host: process.env.SMTP_HOST || file.smtpHost || 'smtp.office365.com',
            port: Number(process.env.SMTP_PORT || file.smtpPort || 587),
            secure: process.env.SMTP_SECURE === 'true' || !!file.smtpSecure,
            user: process.env.SMTP_USER || file.smtpUser || '',
            pass: process.env.SMTP_PASS || file.smtpPass || ''
        },
        brevoApiKey: process.env.BREVO_API_KEY || file.brevoApiKey || '',
        fromName: process.env.MAIL_FROM_NAME || file.fromName || 'PTS Learning',
        fromEmail: process.env.MAIL_FROM_EMAIL || process.env.MAIL_FROM || file.fromEmail || process.env.SMTP_USER || file.smtpUser || '',
        requireRealDelivery: process.env.EMAIL_OTP_ALLOW_CONSOLE !== 'true',
        secretsFileExists: fs.existsSync(SECRETS_PATH)
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
        secretsFileExists: s.secretsFileExists
    };
}

module.exports = {
    SECRETS_PATH,
    readSecretsFile,
    writeSecretsFile,
    getMergedMailSettings,
    publicMailStatus
};
