/**
 * ตั้งค่าส่ง Email OTP จริง — อัปเดตอัตโนมัติจาก Admin หรือแก้มือได้
 * thanvasu.com ใช้ Google Workspace → smtp.gmail.com + App Password
 */
module.exports = {
    mode: "smtp",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: "businessdev@thanvasu.com",
    smtpPass: "zwqmqqykmgrzqbcj",
    fromName: "PTS Learning",
    fromEmail: "businessdev@thanvasu.com",
    brevoApiKey: ''
};
