/**
 * คัดลอกไฟล์นี้เป็น mail.local.js แล้วใส่ App Password
 *   copy backend/mail.local.example.js backend/mail.local.js
 *
 * thanvasu.com ใช้ Google Workspace → SMTP = smtp.gmail.com
 * สร้าง App Password: https://myaccount.google.com/apppasswords
 */
module.exports = {
    mode: 'smtp',
    smtpHost: 'smtp.gmail.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'businessdev@thanvasu.com',
    smtpPass: '',
    fromName: 'PTS Learning',
    fromEmail: 'businessdev@thanvasu.com',
    brevoApiKey: ''
};
