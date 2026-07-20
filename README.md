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
| Payments | ชำระเงิน (โหมดจำลอง) |
| Certificates | ใบประกาศ |
| Settings / Notifications | โปรไฟล์และการแจ้งเตือน |
| Admin | แผงแอดมิน |
| kiosk | ตัวจำลอง API สำหรับเครื่องจริง |
