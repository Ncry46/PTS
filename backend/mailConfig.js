/**
 * ค่าเริ่มต้น — ค่าจริงโหลดจาก environment หรือ backend/mail.secrets.json
 * ตั้งค่าได้จากหน้า Admin → แท็บ "อีเมล OTP"
 */
const { getMergedMailSettings } = require('./mailSecrets');

module.exports = new Proxy({}, {
    get(_target, prop) {
        const settings = getMergedMailSettings();
        return settings[prop];
    }
});
