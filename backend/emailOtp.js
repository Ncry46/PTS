const crypto = require('crypto');
const nodemailer = require('nodemailer');

/**
 * Email OTP สำหรับลืมรหัสผ่าน / เปลี่ยนรหัสผ่าน
 *
 * ตั้งค่า SMTP ผ่าน environment:
 *   SMTP_HOST, SMTP_PORT (default 587), SMTP_USER, SMTP_PASS
 *   SMTP_SECURE=true สำหรับพอร์ต 465
 *   MAIL_FROM (อีเมลผู้ส่ง)
 *
 * ถ้ายังไม่ตั้ง SMTP ระบบจะพิมพ์ OTP ลง console เพื่อทดสอบในเครื่อง
 * ตั้ง EMAIL_OTP_REQUIRE_SMTP=true เพื่อบังคับให้ต้องมี SMTP จริง
 */

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const otpStore = new Map(); // key -> { hash, expiresAt, attempts }

function otpKey(email, purpose) {
    return `${String(email || '').trim().toLowerCase()}|${purpose || 'reset'}`;
}

function hashOtp(otp) {
    return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function generateOtp() {
    return String(crypto.randomInt(100000, 999999));
}

function createTransporter() {
    const host = process.env.SMTP_HOST || '';
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    if (!host || !user || !pass) return null;

    return nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user, pass }
    });
}

function maskEmail(email) {
    const [name, domain] = String(email).split('@');
    if (!domain) return '***';
    const visible = name.slice(0, Math.min(2, name.length));
    return `${visible}${'*'.repeat(Math.max(1, name.length - visible.length))}@${domain}`;
}

async function sendOtpEmail(to, otp, purpose) {
    const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@pts-learning.local';
    const isChange = purpose === 'change_password';
    const subject = isChange
        ? 'รหัส OTP สำหรับเปลี่ยนรหัสผ่าน — PTS Learning'
        : 'รหัส OTP สำหรับกู้คืนรหัสผ่าน — PTS Learning';
    const action = isChange ? 'เปลี่ยนรหัสผ่าน' : 'กู้คืนรหัสผ่าน';
    const text = `รหัส OTP สำหรับ${action}ของ PTS Learning คือ ${otp}\nรหัสมีอายุ 5 นาที\nหากคุณไม่ได้ขอรหัสนี้ ให้เพิกเฉยอีเมลนี้`;
    const html = `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1930">
        <h2 style="color:#974258;margin:0 0 12px">PTS Learning</h2>
        <p style="margin:0 0 16px">รหัส OTP สำหรับ<strong>${action}</strong>ของคุณคือ</p>
        <p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#974258;margin:0 0 16px">${otp}</p>
        <p style="margin:0;color:#544245;font-size:14px">รหัสมีอายุ 5 นาที หากคุณไม่ได้ขอรหัสนี้ ให้เพิกเฉยอีเมลนี้</p>
      </div>
    `;

    const transporter = createTransporter();
    if (!transporter) {
        if (process.env.EMAIL_OTP_REQUIRE_SMTP === 'true') {
            const err = new Error('ยังไม่ได้ตั้งค่า SMTP สำหรับส่งอีเมล (SMTP_HOST / SMTP_USER / SMTP_PASS)');
            err.code = 'SMTP_NOT_CONFIGURED';
            throw err;
        }
        console.log(`📧 [EMAIL OTP · console] to=${to} purpose=${purpose} otp=${otp}`);
        return { delivered: false, mode: 'console', masked: maskEmail(to) };
    }

    await transporter.sendMail({ from, to, subject, text, html });
    return { delivered: true, mode: 'smtp', masked: maskEmail(to) };
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

    const sendResult = await sendOtpEmail(normalized, otp, purpose);
    return {
        email: normalized,
        masked: sendResult.masked,
        mode: sendResult.mode,
        expires_in_seconds: Math.floor(OTP_TTL_MS / 1000)
    };
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

function clearEmailOtp(email, purpose = 'reset') {
    otpStore.delete(otpKey(email, purpose));
}

module.exports = {
    issueEmailOtp,
    verifyEmailOtp,
    clearEmailOtp,
    maskEmail
};
