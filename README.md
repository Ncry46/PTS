# PTS Learning

แพลตฟอร์มเรียนทักษะ Personal Assistant (Online / Onsite / Hybrid)

## เริ่มต้นใช้งาน

```bash
npm install
npm start
```

เปิดเว็บที่ `http://localhost:3000`

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
| Admin | แผงแอดมิน |
| kiosk | ตัวจำลอง API สำหรับเครื่องจริง |

## ลืมรหัสผ่าน / เปลี่ยนรหัสผ่าน (Email OTP)

ระบบส่ง OTP 6 หลักทางอีเมล (หมดอายุ 5 นาที)

ตั้งค่า SMTP ก่อนใช้งานจริง:

```bash
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=your@gmail.com
export SMTP_PASS=your-app-password
export MAIL_FROM="PTS Learning <your@gmail.com>"
```

ถ้ายังไม่ตั้ง SMTP เซิร์ฟเวอร์จะพิมพ์ OTP ลง console เพื่อทดสอบในเครื่อง  
ตั้ง `EMAIL_OTP_REQUIRE_SMTP=true` หากต้องการบังคับให้ส่งอีเมลจริงเท่านั้น

- ลืมรหัสผ่าน: หน้า `Login.html` → ลืมรหัสผ่าน
- เปลี่ยนรหัสผ่าน: หน้า `Settings.html` → ส่ง OTP ไปอีเมล แล้วยืนยันพร้อมรหัสผ่านปัจจุบัน
