const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { getMergedMailSettings, publicMailStatus } = require('./mailSecrets');

const OTP_TTL_MS = 5 * 60 * 1000;
const RESET_LINK_TTL_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const otpStore = new Map();
const resetTokenStore = new Map();

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
        <div style="font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#ca1156;margin-bottom:12px">PTS Learning</div>
        <h2 style="margin:0 0 12px;font-size:22px;color:#1c1520">ยืนยันตัวตนด้วยรหัส OTP</h2>
        <p style="margin:0 0 18px;color:#5c4f55;line-height:1.5">รหัส OTP สำหรับ<strong>${action}</strong>ของคุณคือ</p>
        <p style="font-size:34px;letter-spacing:10px;font-weight:700;color:#ca1156;margin:0 0 18px;text-align:center">${otp}</p>
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

/** Generic transactional email (enrollment / payment confirmation). Soft-fail friendly. */
async function sendHtmlEmail(to, subject, text, html) {
    const settings = getMergedMailSettings();
    const from = resolveFrom(settings);
    if (!from) {
        const err = new Error('ยังไม่ได้ตั้งอีเมลผู้ส่ง (From Email)');
        err.code = 'MAIL_FROM_MISSING';
        throw err;
    }
    const mode = String(settings.mode || 'auto').toLowerCase();

    async function viaBrevo() {
        if (!hasBrevoConfig(settings)) {
            const err = new Error('ยังไม่ได้ตั้ง Brevo API Key');
            err.code = 'BREVO_MISSING';
            throw err;
        }
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                'api-key': String(settings.brevoApiKey || '').trim()
            },
            body: JSON.stringify({
                sender: { name: from.name, email: from.email },
                to: [{ email: String(to).trim() }],
                subject,
                textContent: text,
                htmlContent: html
            })
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`Brevo error ${res.status}: ${body.slice(0, 200)}`);
        }
        return { delivered: true, mode: 'brevo' };
    }

    async function viaSmtp() {
        const transporter = createTransporter(settings);
        if (!transporter) {
            const err = new Error('ยังไม่ได้ตั้ง SMTP');
            err.code = 'SMTP_MISSING';
            throw err;
        }
        const info = await transporter.sendMail({
            from: from.formatted,
            to: String(to).trim(),
            subject,
            text,
            html
        });
        return { delivered: true, mode: 'smtp', messageId: info.messageId || null };
    }

    if (mode === 'brevo') return viaBrevo();
    if (mode === 'smtp') return viaSmtp();
    if (hasBrevoConfig(settings)) {
        try {
            return await viaBrevo();
        } catch (e) {
            console.error('⚠️ Brevo failed:', e.message);
            if (!hasSmtpConfig(settings)) throw e;
        }
    }
    if (hasSmtpConfig(settings)) return viaSmtp();

    const err = new Error('ยังไม่ได้ตั้งค่าการส่งอีเมลจริง');
    err.code = 'MAIL_NOT_CONFIGURED';
    throw err;
}

async function sendCouponEmail(to, { fullName, courseName, courseNameEn, code, discountAmount, finalHint }) {
    const name = String(fullName || '').trim() || 'ผู้เรียน';
    const courseTh = String(courseName || '').trim() || 'หลักสูตร';
    const courseEn = String(courseNameEn || '').trim();
    const courseLine = courseEn && courseEn !== courseTh
        ? `${courseTh} / ${courseEn}`
        : courseTh;
    const couponCode = String(code || '').trim();
    const discount = Number(discountAmount) || 0;
    const hint = String(finalHint || '').trim();
    const subject = `คูปองส่วนลดหลักสูตร — ${courseTh} | PA`;
    const text = `สวัสดีคุณ ${name}\n\nคุณได้รับคูปองส่วนลดสำหรับหลักสูตร "${courseLine}"\nรหัสคูปอง: ${couponCode}\nส่วนลด: ${discount.toLocaleString('th-TH')} บาท${hint ? `\n${hint}` : ''}\n\nวิธีใช้: เข้าสู่ระบบ → เปิดหลักสูตร → ชำระเงิน → กรอกรหัสคูปองแล้วกดใช้คูปอง\n\n— PA`;
    const html = `
      <div style="font-family:'Segoe UI',Tahoma,sans-serif;max-width:520px;margin:0 auto;padding:28px;color:#1c1520;background:#fff;border:1px solid #f0e4e7;border-radius:16px">
        <div style="font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#ca1156;margin-bottom:12px">PA</div>
        <h2 style="margin:0 0 12px;font-size:22px;color:#1c1520">คูปองส่วนลดหลักสูตร</h2>
        <p style="margin:0 0 12px;color:#5c4f55;line-height:1.55">สวัสดีคุณ <strong>${name.replace(/</g, '')}</strong></p>
        <p style="margin:0 0 12px;color:#5c4f55;line-height:1.55">คุณได้รับคูปองสำหรับหลักสูตร <strong>${courseLine.replace(/</g, '')}</strong></p>
        <div style="margin:16px 0;padding:16px;background:#faf5f7;border-radius:12px;text-align:center">
          <div style="font-size:12px;color:#8a7a80;margin-bottom:6px">รหัสคูปอง</div>
          <div style="font-size:22px;font-weight:800;letter-spacing:.12em;font-family:Consolas,monospace;color:#1c1520">${couponCode.replace(/</g, '')}</div>
          <div style="margin-top:10px;font-size:14px;color:#5c4f55">ส่วนลด ${discount.toLocaleString('th-TH')} บาท</div>
          ${hint ? `<div style="margin-top:6px;font-size:13px;color:#5c4f55">${hint.replace(/</g, '')}</div>` : ''}
        </div>
        <p style="margin:0;color:#5c4f55;font-size:13px;line-height:1.5">วิธีใช้: เข้าสู่ระบบ → เปิดหลักสูตร → ชำระเงิน → กรอกรหัสคูปองแล้วกดใช้คูปอง</p>
      </div>
    `;
    return sendHtmlEmail(to, subject, text, html);
}

async function sendEnrollmentConfirmEmail(to, { fullName, courseName }) {
    const name = String(fullName || '').trim() || 'ผู้เรียน';
    const course = String(courseName || '').trim() || 'หลักสูตร';
    const subject = `ยืนยันการเปิดสิทธิ์เรียน — ${course} | PTS Learning`;
    const text = `สวัสดีคุณ ${name}\n\nการชำระเงินได้รับการยืนยันแล้ว และเปิดสิทธิ์เข้าเรียนหลักสูตร "${course}" ให้คุณแล้ว\nเข้าสู่ระบบแล้วไปที่หน้าหลักสูตรของฉันเพื่อเริ่มเรียนได้ทันที\n\n— PTS Learning`;
    const html = `
      <div style="font-family:'Segoe UI',Tahoma,sans-serif;max-width:520px;margin:0 auto;padding:28px;color:#1c1520;background:#fff;border:1px solid #f0e4e7;border-radius:16px">
        <div style="font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#ca1156;margin-bottom:12px">PTS Learning</div>
        <h2 style="margin:0 0 12px;font-size:22px;color:#1c1520">เปิดสิทธิ์เรียนแล้ว</h2>
        <p style="margin:0 0 12px;color:#5c4f55;line-height:1.55">สวัสดีคุณ <strong>${name.replace(/</g, '')}</strong></p>
        <p style="margin:0 0 18px;color:#5c4f55;line-height:1.55">การชำระเงินได้รับการยืนยันแล้ว และเปิดสิทธิ์เข้าเรียนหลักสูตร <strong>${course.replace(/</g, '')}</strong> ให้คุณแล้ว — รีเฟรชหน้าเว็บแล้วเริ่มเรียนได้ทันที</p>
        <p style="margin:0;color:#5c4f55;font-size:13px;line-height:1.5">หากมีคำถาม ติดต่อทีม PTS Learning ได้ตามช่องทางในเว็บไซต์</p>
      </div>
    `;
    return sendHtmlEmail(to, subject, text, html);
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

function getAppBaseUrl() {
    return String(process.env.APP_BASE_URL || process.env.PUBLIC_BASE_URL || 'http://localhost:3000')
        .trim()
        .replace(/\/$/, '') || 'http://localhost:3000';
}

function hashResetToken(token) {
    return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function purgeExpiredResetTokens() {
    const now = Date.now();
    for (const [key, entry] of resetTokenStore.entries()) {
        if (!entry || now > entry.expiresAt) resetTokenStore.delete(key);
    }
}

function invalidateResetTokensForEmail(email, purpose) {
    const normalized = String(email || '').trim().toLowerCase();
    const wantPurpose = purpose || 'reset';
    for (const [key, entry] of resetTokenStore.entries()) {
        if (entry && entry.email === normalized && entry.purpose === wantPurpose) {
            resetTokenStore.delete(key);
        }
    }
}

function buildResetLinkContent(resetUrl, purpose) {
    const isChange = purpose === 'change_password';
    const subject = isChange
        ? 'ลิงก์เปลี่ยนรหัสผ่าน — PTS Learning'
        : 'ลิงก์กู้คืนรหัสผ่าน — PTS Learning';
    const action = isChange ? 'เปลี่ยนรหัสผ่าน' : 'กู้คืนรหัสผ่าน';
    const text = [
        `ลิงก์สำหรับ${action}ของ PTS Learning:`,
        resetUrl,
        '',
        'ลิงก์มีอายุ 30 นาที และใช้ได้ครั้งเดียว',
        'หากคุณไม่ได้ขออีเมลนี้ ให้เพิกเฉยได้เลย'
    ].join('\n');
    const html = `
      <div style="font-family:'Segoe UI',Tahoma,sans-serif;max-width:480px;margin:0 auto;padding:28px;color:#1c1520;background:#fff;border:1px solid #f0e4e7;border-radius:16px">
        <div style="font-size:13px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#ca1156;margin-bottom:12px">PTS Learning</div>
        <h2 style="margin:0 0 12px;font-size:22px;color:#1c1520">${action}</h2>
        <p style="margin:0 0 18px;color:#5c4f55;line-height:1.5">กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านใหม่บนเว็บไซต์ (ไม่ต้องใช้รหัส OTP)</p>
        <p style="margin:0 0 22px;text-align:center">
          <a href="${resetUrl}" style="display:inline-block;background:#ca1156;color:#fff;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:999px">ตั้งรหัสผ่านใหม่</a>
        </p>
        <p style="margin:0 0 10px;color:#5c4f55;font-size:13px;line-height:1.5">ถ้าปุ่มกดไม่ได้ ให้เปิดลิงก์นี้:</p>
        <p style="margin:0 0 18px;word-break:break-all;font-size:12px;color:#8a7a80">${resetUrl}</p>
        <p style="margin:0;color:#5c4f55;font-size:13px;line-height:1.5">ลิงก์มีอายุ 30 นาที และใช้ได้ครั้งเดียว หากคุณไม่ได้ขออีเมลนี้ ให้เพิกเฉยได้เลย</p>
      </div>
    `;
    return { subject, text, html };
}

async function issuePasswordResetLink(email, purpose = 'reset') {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
        const err = new Error('อีเมลไม่ถูกต้อง');
        err.code = 'INVALID_EMAIL';
        throw err;
    }

    purgeExpiredResetTokens();
    invalidateResetTokensForEmail(normalized, purpose);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(token);
    const expiresAt = Date.now() + RESET_LINK_TTL_MS;
    resetTokenStore.set(tokenHash, {
        email: normalized,
        purpose: purpose || 'reset',
        expiresAt
    });

    const resetUrl = `${getAppBaseUrl()}/reset-password.html?token=${encodeURIComponent(token)}`;
    const { subject, text, html } = buildResetLinkContent(resetUrl, purpose);

    try {
        const settings = getMergedMailSettings();
        if (!settings.requireRealDelivery && process.env.EMAIL_OTP_ALLOW_CONSOLE === 'true'
            && !hasBrevoConfig(settings) && !hasSmtpConfig(settings)) {
            console.log(`📧 [RESET LINK · console ONLY] to=${normalized} purpose=${purpose} url=${resetUrl}`);
            return {
                email: normalized,
                masked: maskEmail(normalized),
                mode: 'console',
                delivered: false,
                expires_in_seconds: Math.floor(RESET_LINK_TTL_MS / 1000)
            };
        }

        const sendResult = await sendHtmlEmail(normalized, subject, text, html);
        console.log(`📧 Reset-link email delivered via ${sendResult.mode} → to=${maskEmail(normalized)}`);
        return {
            email: normalized,
            masked: maskEmail(normalized),
            mode: sendResult.mode,
            delivered: !!sendResult.delivered,
            expires_in_seconds: Math.floor(RESET_LINK_TTL_MS / 1000)
        };
    } catch (error) {
        resetTokenStore.delete(tokenHash);
        throw error;
    }
}

function peekPasswordResetToken(token) {
    purgeExpiredResetTokens();
    const raw = String(token || '').trim();
    if (!raw) return { ok: false, message: 'ไม่พบลิงก์ตั้งรหัสผ่าน' };
    const entry = resetTokenStore.get(hashResetToken(raw));
    if (!entry) return { ok: false, message: 'ลิงก์ไม่ถูกต้อง หรือถูกใช้ไปแล้ว' };
    if (Date.now() > entry.expiresAt) {
        resetTokenStore.delete(hashResetToken(raw));
        return { ok: false, message: 'ลิงก์หมดอายุแล้ว กรุณาขอลิงก์ใหม่' };
    }
    return {
        ok: true,
        email: entry.email,
        masked: maskEmail(entry.email),
        purpose: entry.purpose,
        expires_in_seconds: Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000))
    };
}

function consumePasswordResetToken(token) {
    const peeked = peekPasswordResetToken(token);
    if (!peeked.ok) return peeked;
    resetTokenStore.delete(hashResetToken(String(token || '').trim()));
    return {
        ok: true,
        email: peeked.email,
        purpose: peeked.purpose
    };
}

function getMailStatus() {
    return publicMailStatus();
}

module.exports = {
    issueEmailOtp,
    verifyEmailOtp,
    issuePasswordResetLink,
    peekPasswordResetToken,
    consumePasswordResetToken,
    getMailStatus,
    maskEmail,
    sendOtpEmail,
    sendHtmlEmail,
    sendEnrollmentConfirmEmail,
    sendCouponEmail
};
