# ขึ้นออนไลน์ PTS Learning

เป้าหมาย: ให้คนเข้าเว็บได้จากอินเทอร์เน็ต (มีลิงก์ HTTPS จริง)

แนะนำใช้ **Render** (ฟรีเริ่มต้นได้ + ดึงจาก GitHub + ใช้ Dockerfile ของโปรเจกต์นี้)

```
GitHub (branch cursor/go-online-eb8c)
        ↓
   Render build Docker
        ↓
  https://xxxx.onrender.com
        ↓
 SQL Server เดิม (tvsdb2...)
```

---

## สิ่งที่ต้องมีก่อน

1. บัญชี [GitHub](https://github.com) ที่ push โค้ด PTS แล้ว
2. บัญชี [Render](https://render.com) (สมัครด้วย GitHub ได้)
3. รหัส SQL Server (`DB_PASSWORD`) และ SMTP App Password (ถ้าใช้ OTP)
4. **สำคัญมาก:** SQL Server ต้องอนุญาตให้เซิร์ฟเวอร์ Render ต่อเข้าได้  
   ถ้าไฟร์วอลล์ SQL รับเฉพาะ IP ออฟฟิศ → เว็บขึ้นแล้วแต่ล็อกอิน/โหลดข้อมูลไม่ได้

---

## วิธีขึ้นออนไลน์ด้วย Render (แนะนำ)

### 1) Push branch นี้ขึ้น GitHub

บนเครื่องคุณ:

```powershell
cd C:\Users\Admin_Support\Desktop\BD-PTS\PTS
git fetch origin
git checkout cursor/go-online-eb8c
git pull
```

ตรวจว่ามีไฟล์ `Dockerfile` และ `render.yaml`

### 2) สร้าง Web Service บน Render

1. เปิด https://dashboard.render.com
2. **New +** → **Blueprint** (หรือ **Web Service**)
3. เชื่อม GitHub แล้วเลือก repo `Ncry46/PTS`
4. Branch: `cursor/go-online-eb8c`
5. Runtime: **Docker** (ถ้าสร้าง Web Service เอง)
6. Region: **Singapore** (ใกล้ไทย)

### 3) ใส่ Environment Variables

ในหน้า Environment ของ service ใส่ค่าเหล่านี้:

| Key | ตัวอย่าง / คำอธิบาย |
|-----|---------------------|
| `APP_BASE_URL` | `https://ชื่อบริการของคุณ.onrender.com` (ใส่หลังได้ URL จริง) |
| `DB_USER` | `uinet` |
| `DB_PASSWORD` | รหัส SQL จริง |
| `DB_SERVER` | `tvsdb2.thanvasupos.com` |
| `DB_PORT` | `28914` |
| `DB_NAME` | `BD_PTS` |
| `TRUST_PROXY` | `1` |
| `COOKIE_SECURE` | `true` |
| `SESSION_SECRET` | สตริงสุ่มยาวๆ (หรือให้ Render generate) |
| `SMTP_USER` | อีเมลผู้ส่ง OTP |
| `SMTP_PASS` | Google App Password |
| `MAIL_FROM_EMAIL` | อีเมลผู้ส่ง |

แล้วกด **Deploy**

### 4) รอ build เสร็จ

ดู Logs:
- เห็น `Connected to Microsoft SQL Server` = ต่อ DB ได้
- เห็น `Server running on http://0.0.0.0:...` = พร้อม
- เปิด URL ที่ Render ให้ เช่น `https://pts-learning-xxxx.onrender.com`

ทดสอบ:
- หน้าแรกขึ้น
- `/api/health` ตอบ `{ "ok": true, "db": true }`

### 5) หลังได้ URL จริง

อัปเดต:
- `APP_BASE_URL` = URL จริง
- ถ้าใช้ Google Calendar: `GOOGLE_REDIRECT_URI=https://YOUR-URL/api/google/oauth/callback` และใส่ใน Google Cloud Console ด้วย

---

## ทางเลือก: Docker Hub + VPS

ถ้ามีเซิร์ฟเวอร์เอง (หรือ Lightsail / DigitalOcean):

```powershell
docker build -t YOUR_DOCKERHUB_USER/pts-learning:latest .
docker login
docker push YOUR_DOCKERHUB_USER/pts-learning:latest
```

บนเซิร์ฟเวอร์:

```bash
docker pull YOUR_DOCKERHUB_USER/pts-learning:latest
docker run -d --name pts-learning -p 80:3000 \
  --env-file .env \
  -e TRUST_PROXY=1 -e COOKIE_SECURE=true \
  -v pts_uploads:/app/uploads \
  --restart unless-stopped \
  YOUR_DOCKERHUB_USER/pts-learning:latest
```

รายละเอียดเพิ่มใน `DOCKER.md`

---

## แก้ปัญหาที่พบบ่อย

| อาการ | สาเหตุที่พบบ่อย | แก้ |
|--------|------------------|-----|
| Deploy วนลูป / 503 | ต่อ SQL ไม่ได้ | เปิด firewall SQL ให้รับจากอินเทอร์เน็ต / IP ของ Render |
| หน้าขึ้นแต่ล็อกอินหลุด | cookie ไม่ secure | ตั้ง `TRUST_PROXY=1` และ `COOKIE_SECURE=true` |
| OTP ไม่ส่ง | ไม่มี `SMTP_PASS` | ใส่ App Password ใน env |
| รูปอัปโหลดหายหลัง redeploy | disk ชั่วคราวบน Free plan | ใช้ Persistent Disk หรือเก็บรูปบน storage ภายนอก |

---

## สรุปสั้นๆ

โค้ดพร้อมขึ้นออนไลน์แล้วบน branch **`cursor/go-online-eb8c`**  
ขั้นตอนที่คุณทำ: **สร้างบริการบน Render → ใส่ env → Deploy → ได้ลิงก์ HTTPS**

ถ้าต้องการโดเมนของบริษัท (เช่น `pts.thanvasu.com`) บอกได้ จะช่วยไล่ขั้นชี้ DNS ต่อได้
