# PTS Learning

แพลตฟอร์มเรียนทักษะ Personal Assistant (Online / Onsite / Hybrid)

## เริ่มต้นใช้งาน

```bash
npm install
npm start
```

เปิดเว็บที่ `http://localhost:3000`

## ส่ง Email OTP จริง (สำคัญ)

`thanvasu.com` ใช้ **Google Workspace** → ส่งผ่าน `smtp.gmail.com`

### วิธีเร็วสุด (แก้ไฟล์เดียว เหมือนรหัส SQL)

1. เปิด `backend/mail.local.js`
2. ใส่ **App Password** ของ Google ในช่อง `smtpPass`
3. สร้าง App Password ที่ https://myaccount.google.com/apppasswords (ต้องเปิดยืนยันตัวตน 2 ขั้นก่อน)
4. รีสตาร์ท `npm start`

`smtpUser` / `fromEmail` = เมล**ผู้ส่งของระบบ** (กล่องเดียว)  
OTP จะถูกส่งไปหา**อีเมลของผู้ใช้ทุกคน**ในระบบ เช่น `@gmail.com`, `@hotmail.com`, เมลบริษัท ฯลฯ — ไม่จำกัดแค่เมล thanvasu

ค่าเริ่มต้นผู้ส่ง: `businessdev@thanvasu.com` ผ่าน `smtp.gmail.com`

### หรือตั้งจากหน้า Admin
ล็อกอิน admin → `Admin.html` → แท็บ **อีเมล OTP** → บันทึก → ส่งทดสอบ

### หรือใช้ `.env`
```bash
cp .env.example .env
# แก้ SMTP_PASS แล้ว npm start
```


## โครงสร้างหลัก

- `backend/` — Express API + SQL Server
- `frontend/` — หน้าเว็บ HTML
- `components/` — navbar และ CSS ร่วม
- `PRODUCT.md` / `DESIGN.md` — บริบทแบรนด์และดีไซน์สำหรับ Impeccable (AI design commands)

### Impeccable (ออกแบบ UI ร่วมกับ AI)

ติดตั้ง skills แล้วที่ `.cursor/skills/impeccable` (v3.9.1)

```bash
# ตัวอย่างคำสั่งใน Cursor
/impeccable critique Settings
/impeccable polish Home
/impeccable audit Courses
/impeccable live
```

อ่าน `PRODUCT.md` (ใคร/ทำไม) และ `DESIGN.md` (สี ฟอนต์ คอมโพเนนต์) ก่อนแก้ UI ทุกครั้ง

## บัญชีและสิทธิ์

- Guest: ดูคอร์ส/อ่านคอมมูนิตี้
- Student: สมัครเรียน เรียนบทเรียน โพสต์/ไลก์ ชำระเงิน ใบประกาศ
- Admin: จัดการที่ `Admin.html` (ต้องตั้ง `Role = admin` ในตาราง `users_main`)

## หน้าสำคัญ

| หน้า | คำอธิบาย |
|------|----------|
| Home / Courses / CourseDetail | หลักสูตร |
| Learn | เรียนบทเรียน |
| Community / Liked | คอมมูนิตี้ |
| Favorites | คอร์สโปรด |
| Schedule | ตารางเรียน |
| Payments | ชำระเงิน PromptPay (ยืนยันในระบบตามบัญชีผู้ใช้) |
| Certificates | ใบประกาศ |
| Settings / Notifications | โปรไฟล์และการแจ้งเตือน |
| Admin | แผงแอดมิน + ตั้งค่าอีเมล OTP |
| kiosk | ตัวจำลอง API สำหรับเครื่องจริง |

## ลืมรหัสผ่าน / เปลี่ยนรหัสผ่าน

- ลืมรหัสผ่าน: `Login.html` → ลืมรหัสผ่าน → OTP เข้าอีเมล
- เปลี่ยนรหัสผ่าน: `Settings.html` → ส่ง OTP ไปอีเมล + รหัสผ่านปัจจุบัน
