const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getMergedMailSettings, publicMailStatus } = require('./mailSecrets');

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const otpStore = new Map();

function otpKey(email, purpose) {
    return `${String(email || '').trim().toLowerCase()}|${purpose || 'reset'}`;
}

function hashOtp(otp) {
    return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function generateOtp() {
    return String(crypto.randomInt(100000, 999999));
}

function maskEmail(email) {
    const [name, domain] = String(email).split('@');
    if (!domain) return '***';
    const visible = name.slice(0, Math.min(2, name.length));
    return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

function resolveFrom(settings) {
    const email = String(settings.fromEmail || settings.smtp.user || '').trim();
    const name = settings.fromName || 'PTS Learning';
    if (!email) return null;
    return { name, email, formatted: `"${name}" <${email}>` };
}

function hasSmtpConfig(settings) {
    return !!(settings.smtp.host && settings.smtp.user && settings.smtp.pass);
}

function hasBrevoConfig(settings) {
    return !!String(settings.brevoApiKey || '').trim();
}

function createTransporter(settings) {
    if (!hasSmtpConfig(settings)) return null;
    return nodemailer.createTransport({
        host: settings.smtp.host,
        port: settings.smtp.port,
        secure: !!settings.smtp.secure,
        auth: {
            user: settings.smtp.user,
            pass: settings.smtp.pass
        }
    });
}

function buildOtpContent(otp, purpose) {
    const isChange = purpose === 'change_password';
    const subject = isChange
        ? 'รหัส OTP สำหรับเปลี่ยนรหัสผ่าน — PTS Learning'
        : 'รหัส OTP สำหรับกู้คืนรหัสผ่าน — PTS Learning';
    const action = isChange ? 'เปลี่ยนรหัสผ่าน' : 'กู้คืนรหัสผ่าน';
    const text = `รหัส OTP สำหรับ${action}ของ PTS Learning คือ ${otp}\nรหัสมีอายุ 5 นาที\nหากคุณไม่ได้ขอรหัสนี้ ให้เพิกเฉยอีเมลนี้`;
    const html = `
      <div style="font-family:'Segoe UI',Tahoma,sans-serif;max-width:480px;margin:0 auto;padding:28px;color:#1c1520;background:#fff;border:1px solid #f0e4e7;border-radius:16px">
        <div style="font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#974258;margin-bottom:12px">PTS Learning</div>
        <h2 style="margin:0 0 12px;font-size:22px;color:#1c1520">ยืนยันตัวตนด้วยรหัส OTP</h2>
        <p style="margin:0 0 18px;color:#5c4f55;line-height:1.5">รหัส OTP สำหรับ<strong>${action}</strong>ของคุณคือ</p>
        <p style="font-size:34px;letter-spacing:10px;font-weight:700;color:#974258;margin:0 0 18px;text-align:center">${otp}</p>
        <p style="margin:0;color:#5c4f55;font-size:13px;line-height:1.5">รหัสมีอายุ 5 นาที หากคุณไม่ได้ขอรหัสนี้ ให้เพิกเฉยอีเมลนี้</p>
      </div>
    `;
    return { subject, text, html };
}

async function sendViaBrevo(settings, to, otp, purpose) {
    const from = resolveFrom(settings);
    if (!from) {
        const err = new Error('ยังไม่ได้ตั้งอีเมลผู้ส่ง (From Email)');
        err.code = 'MAIL_FROM_MISSING';
        throw err;
    }
    const { subject, text, html } = buildOtpContent(otp, purpose);
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': settings.brevoApiKey
        },
        body: JSON.stringify({
            sender: { name: from.name, email: from.email },
            to: [{ email: to }],
            subject,
            htmlContent: html,
            textContent: text
        })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const detail = data?.message || JSON.stringify(data);
        const err = new Error(`Brevo ส่งอีเมลไม่สำเร็จ: ${detail}`);
        err.code = 'BREVO_SEND_FAILED';
        throw err;
    }
    return { delivered: true, mode: 'brevo', messageId: data.messageId || null };
}

async function sendViaSmtp(settings, to, otp, purpose) {
    if (!hasSmtpConfig(settings)) {
        const err = new Error('ยังไม่ได้ตั้งค่า SMTP — ใส่ App Password ที่ backend/mail.local.js (smtpPass)');
        err.code = 'SMTP_NOT_CONFIGURED';
        throw err;
    }
    const from = resolveFrom(settings);
    if (!from) {
        const err = new Error('ยังไม่ได้ตั้งอีเมลผู้ส่ง');
        err.code = 'MAIL_FROM_MISSING';
        throw err;
    }
    const { subject, text, html } = buildOtpContent(otp, purpose);

    const isGmail = /gmail\.com$/i.test(settings.smtp.host) || /gmail\.com$/i.test(settings.smtp.user);
    const transporter = nodemailer.createTransport(
        isGmail
            ? {
                service: 'gmail',
                auth: {
                    user: settings.smtp.user,
                    pass: String(settings.smtp.pass).replace(/\s+/g, '')
                }
            }
            : {
                host: settings.smtp.host,
                port: settings.smtp.port,
                secure: !!settings.smtp.secure,
                auth: {
                    user: settings.smtp.user,
                    pass: String(settings.smtp.pass).replace(/\s+/g, '')
                }
            }
    );

    const info = await transporter.sendMail({
        from: from.formatted,
        to,
        subject,
        text,
        html
    });
    return { delivered: true, mode: isGmail ? 'gmail' : 'smtp', messageId: info.messageId || null };
}

async function sendOtpEmail(to, otp, purpose) {
    const settings = getMergedMailSettings();
    const mode = String(settings.mode || 'auto').toLowerCase();

    const tryBrevo = () => sendViaBrevo(settings, to, otp, purpose);
    const trySmtp = () => sendViaSmtp(settings, to, otp, purpose);

    if (mode === 'brevo') return tryBrevo();
    if (mode === 'smtp') return trySmtp();

    if (hasBrevoConfig(settings)) {
        try {
            return await tryBrevo();
        } catch (e) {
            console.error('⚠️ Brevo failed:', e.message);
            if (!hasSmtpConfig(settings)) throw e;
        }
    }
    if (hasSmtpConfig(settings)) {
        return trySmtp();
    }

    if (!settings.requireRealDelivery && process.env.EMAIL_OTP_ALLOW_CONSOLE === 'true') {
        console.log(`📧 [EMAIL OTP · console ONLY] to=${to} purpose=${purpose} otp=${otp}`);
        return { delivered: false, mode: 'console' };
    }

    const err = new Error(
        'ยังไม่ได้ตั้งค่าการส่งอีเมลจริง — ไปที่ Admin → อีเมล OTP แล้วกรอก SMTP หรือ Brevo API Key'
    );
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
}

async function issueEmailOtp(email, purpose = 'reset') {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
        const err = new Error('อีเมลไม่ถูกต้อง');
        err.code = 'INVALID_EMAIL';
        throw err;
    }

    const otp = generateOtp();
    const key = otpKey(normalized, purpose);
    otpStore.set(key, {
        hash: hashOtp(otp),
        expiresAt: Date.now() + OTP_TTL_MS,
        attempts: 0
    });

    try {
        const sendResult = await sendOtpEmail(normalized, otp, purpose);
        console.log(`📧 OTP email delivered via ${sendResult.mode} → to=${maskEmail(normalized)} (any user email)`);
        return {
            email: normalized,
            masked: maskEmail(normalized),
            mode: sendResult.mode,
            delivered: !!sendResult.delivered,
            expires_in_seconds: Math.floor(OTP_TTL_MS / 1000)
        };
    } catch (error) {
        otpStore.delete(key);
        throw error;
    }
}

function verifyEmailOtp(email, otp, purpose = 'reset') {
    const key = otpKey(email, purpose);
    const entry = otpStore.get(key);
    if (!entry) {
        return { ok: false, message: 'ไม่พบรหัส OTP กรุณาขอรหัสใหม่อีกครั้ง' };
    }
    if (Date.now() > entry.expiresAt) {
        otpStore.delete(key);
        return { ok: false, message: 'รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่' };
    }
    if (entry.attempts >= MAX_ATTEMPTS) {
        otpStore.delete(key);
        return { ok: false, message: 'ใส่รหัสผิดเกินจำนวนครั้งที่อนุญาต กรุณาขอรหัสใหม่' };
    }

    entry.attempts += 1;
    if (entry.hash !== hashOtp(String(otp || '').trim())) {
        return { ok: false, message: 'รหัส OTP ไม่ถูกต้อง' };
    }

    otpStore.delete(key);
    return { ok: true };
}

function getMailStatus() {
    return publicMailStatus();
}

module.exports = {
    issueEmailOtp,
    verifyEmailOtp,
    getMailStatus,
    maskEmail,
    sendOtpEmail
};
