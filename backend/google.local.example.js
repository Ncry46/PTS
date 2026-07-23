/**
 * คัดลอกไฟล์นี้เป็น google.local.js แล้วใส่ค่าจาก Google Cloud Console
 *   copy backend/google.local.example.js backend/google.local.js
 *
 * ขั้นตอนสั้นๆ:
 * 1) ไปที่ https://console.cloud.google.com/
 * 2) สร้างโปรเจกต์ → APIs & Services → Enable "Google Calendar API"
 * 3) Credentials → Create OAuth client ID (Web application)
 * 4) Authorized redirect URIs ใส่ค่า redirectUri ด้านล่าง
 * 5) ใส่ Client ID / Client Secret ที่นี่ หรือในไฟล์ .env
 */
module.exports = {
    clientId: '',
    clientSecret: '',
    // ต้องตรงกับ Redirect URI ใน Google Cloud ทุกตัวอักษร
    redirectUri: 'http://localhost:3000/api/google/oauth/callback',
    appBaseUrl: 'http://localhost:3000'
};
