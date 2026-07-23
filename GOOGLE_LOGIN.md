# เข้าสู่ระบบด้วย Gmail

ปุ่ม **เข้าสู่ระบบด้วย Gmail** บน `Login.html` ใช้ Google OAuth จริงแล้ว

## สิ่งที่ต้องมี

1. OAuth Client (Web application) ใน [Google Cloud Console](https://console.cloud.google.com/)
2. ค่าใน `backend/google.local.js` หรือไฟล์ `.env`:

```js
module.exports = {
  clientId: 'xxxx.apps.googleusercontent.com',
  clientSecret: 'GOCSPX-xxxx',
  redirectUri: 'http://localhost:3000/api/google/oauth/callback',
  appBaseUrl: 'http://localhost:3000'
};
```

3. ใน Google Cloud → Credentials → OAuth client:
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** `http://localhost:3000/api/google/oauth/callback`  
     (ต้องตรงทุกตัวอักษร — ใช้ร่วมกับ Google Calendar)

## ทดสอบ

```powershell
npm start
```

เปิด `http://localhost:3000/Login.html` → กด **เข้าสู่ระบบด้วย Gmail**

- ถ้าอีเมลมีในระบบแล้ว → ล็อกอินเข้าบัญชีนั้น
- ถ้ายังไม่มี → สร้างบัญชี student ให้อัตโนมัติ
- หลังล็อกอินสำเร็จ → ไปที่ **หน้าแรก** (`Home.html`)

ตรวจสถานะ: `http://localhost:3000/api/auth/google/status`

## หมายเหตุ

- Redirect URI เดียวกับ Calendar — ไม่ต้องสร้าง Client ใหม่
- บน production เปลี่ยนเป็น `https://โดเมนจริง/...` ทั้งใน Google Cloud และ `APP_BASE_URL` / `GOOGLE_REDIRECT_URI`
