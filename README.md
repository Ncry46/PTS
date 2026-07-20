# PTS Learning

แพลตฟอร์มเรียนทักษะ Personal Assistant (Online / Onsite / Hybrid)

## เริ่มต้นใช้งาน

```bash
npm install
npm start
```

เปิดเว็บที่ `http://localhost:3000`

## ส่ง Email OTP จริง (สำคัญ)

ระบบ**บังคับส่ง OTP เข้าอีเมลจริง** — ไม่ใช้ mock

ตั้งค่าอย่างใดอย่างหนึ่ง:

### วิธีที่ 1 — จากหน้า Admin (แนะนำ)
1. ล็อกอินด้วยบัญชี `Role = admin`
2. เปิด `Admin.html` → แท็บ **อีเมล OTP**
3. กรอก SMTP (เช่น Office 365 / Gmail App Password) หรือ Brevo API Key
4. กด **บันทึก** แล้ว **ส่ง OTP ทดสอบ** ไปอีเมลตัวเอง

### วิธีที่ 2 — ไฟล์ `.env`
คัดลอก `.env.example` เป็น `.env` แล้วกรอกค่า:

```bash
cp .env.example .env
```

```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=your@thanvasu.com
SMTP_PASS=your-password
MAIL_FROM_EMAIL=your@thanvasu.com
MAIL_FROM_NAME=PTS Learning
```

หรือใช้ Brevo:

```env
BREVO_API_KEY=xkeysib-xxxx
MAIL_FROM_EMAIL=verified-sender@yourdomain.com
```

ค่าที่บันทึกจาก Admin อยู่ใน `backend/mail.secrets.json` (ไม่ commit ขึ้น git)

## โครงสร้างหลัก

- `backend/` — Express API + SQL Server
- `frontend/` — หน้าเว็บ HTML
- `components/` — navbar และ CSS ร่วม

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
