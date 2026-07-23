/**
 * คัดลอกไฟล์นี้เป็น google.local.js แล้วใส่ค่าจาก Google Cloud Console
 *   copy backend/google.local.example.js backend/google.local.js
 *
 * ขั้นตอนสั้นๆ:
 * 1) ไปที่ https://console.cloud.google.com/
 * 2) สร้างโปรเจกต์ → APIs & Services → Enable "Google Calendar API" (ถ้าใช้ปฏิทิน)
 * 3) Credentials → Create OAuth client ID (Web application)
 * 4) Authorized JavaScript origins: http://localhost:3000
 * 5) Authorized redirect URIs ใส่ค่า redirectUri ด้านล่าง (ใช้ร่วม Login + Calendar)
 * 6) ใส่ Client ID / Client Secret ที่นี่ หรือในไฟล์ .env
 *
 * เข้าสู่ระบบด้วย Gmail ใช้ endpoint:
 *   /api/auth/google/start → callback เดิม /api/google/oauth/callback
 */
module.exports = {
    clientId: '',
    clientSecret: '',
    // ต้องตรงกับ Redirect URI ใน Google Cloud ทุกตัวอักษร
    redirectUri: 'http://localhost:3000/api/google/oauth/callback',
    appBaseUrl: 'http://localhost:3000'
};
