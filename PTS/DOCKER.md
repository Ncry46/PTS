# ขึ้นออนไลน์ด้วย Docker + Docker Hub

Docker Hub เก็บ **image** ของเว็บไว้บนคลาวด์  
จากนั้นนำ image ไปรันบนเครื่องเซิร์ฟเวอร์ / VPS / คลาวด์ใดก็ได้ที่ติดตั้ง Docker

```
[โค้ด PTS] → docker build → [Docker Hub] → docker pull + run → เว็บออนไลน์
```

แอปนี้เชื่อม **SQL Server ภายนอก** (`DB_SERVER`) อยู่แล้ว จึงไม่ต้องใส่ SQL ใน container

---

## 1) เตรียมเครื่อง (ครั้งแรก)

ติดตั้ง [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac) หรือ Docker Engine (Linux)

สมัคร [Docker Hub](https://hub.docker.com/) แล้วจำ **username**

ในโฟลเดอร์โปรเจกต์:

```powershell
cd C:\Users\Admin_Support\Desktop\BD-PTS\PTS
copy .env.example .env
```

แก้ `.env` ให้ครบอย่างน้อย:

- `DB_PASSWORD` — รหัส SQL Server
- `SMTP_PASS` — Google App Password (ถ้าใช้ OTP)
- `SESSION_SECRET` — สตริงสุ่มยาวๆ
- `APP_BASE_URL` — URL จริงตอนออนไลน์ เช่น `https://pts.yourdomain.com`

---

## 2) Build + ทดสอบในเครื่อง

```powershell
docker build -t pts-learning:latest .
docker run --rm -p 3000:3000 --env-file .env pts-learning:latest
```

เปิด `http://localhost:3000`  
หยุดด้วย Ctrl+C

หรือใช้ Compose:

```powershell
docker compose up -d --build
docker compose logs -f
docker compose down
```

---

## 3) Push ขึ้น Docker Hub

แทนที่ `YOUR_USER` ด้วย username ของคุณ:

```powershell
docker login
docker tag pts-learning:latest YOUR_USER/pts-learning:latest
docker push YOUR_USER/pts-learning:latest
```

ตรวจที่ https://hub.docker.com/r/YOUR_USER/pts-learning

---

## 4) รันออนไลน์บนเซิร์ฟเวอร์ (VPS)

บนเครื่องที่มี Docker และเข้าถึง SQL Server ได้:

```bash
# สร้างไฟล์ .env บนเซิร์ฟเวอร์ (ค่าจริง + APP_BASE_URL เป็นโดเมนของคุณ)
docker pull YOUR_USER/pts-learning:latest
docker run -d \
  --name pts-learning \
  -p 80:3000 \
  --env-file .env \
  -e TRUST_PROXY=1 \
  -e COOKIE_SECURE=true \
  -v pts_uploads:/app/uploads \
  --restart unless-stopped \
  YOUR_USER/pts-learning:latest
```

- พอร์ต `80:3000` = เปิดเว็บที่ `http://IP-เซิร์ฟเวอร์`
- ถ้ามีโดเมน + HTTPS แนะนำใส่ **Nginx / Caddy** หน้า Docker แล้วตั้ง `APP_BASE_URL=https://...`

อัปเดตเวอร์ชันใหม่:

```bash
docker pull YOUR_USER/pts-learning:latest
docker stop pts-learning && docker rm pts-learning
# รันคำสั่ง docker run เดิมอีกครั้ง
```

---

## 5) อัปเดต image หลังแก้โค้ด

```powershell
docker build -t YOUR_USER/pts-learning:latest .
docker push YOUR_USER/pts-learning:latest
```

แล้วบนเซิร์ฟเวอร์ `docker pull` + รีสตาร์ท container ตามข้อ 4

---

## หมายเหตุสำคัญ

| หัวข้อ | รายละเอียด |
|--------|------------|
| Docker Hub ≠ โฮสต์เว็บ | Hub เก็บ image; ต้องมีเครื่องรัน container |
| ฐานข้อมูล | ใช้ SQL Server เดิมผ่าน `DB_*` ใน `.env` |
| ความลับ | อย่าใส่รหัสใน Dockerfile; ใช้ `.env` / `--env-file` |
| อีเมล OTP | ตั้ง `SMTP_PASS` ใน `.env` ของ container |
| ไฟล์อัปโหลด | mount volume `pts_uploads` กันหายตอน recreate |

### ตัวเลือกโฮสต์ที่รัน Docker ได้

- VPS: DigitalOcean, Linode, AWS Lightsail, ออฟฟิศเซิร์ฟเวอร์
- แพลตฟอร์ม container: Railway, Render, Fly.io, Google Cloud Run (ตั้ง env แล้วชี้ image จาก Docker Hub)

<<<<<<< HEAD
=======
สำหรับ checklist ขึ้นออนไลน์แบบเต็ม (Render Blueprint / env / firewall) ดู **[GO_ONLINE.md](./GO_ONLINE.md)**

>>>>>>> cursor/premium-banner-fx-eb8c
---

## Troubleshooting

**ขึ้นไม่ติด / ออกทันที**  
`docker logs pts-learning` — มักเป็นต่อ SQL ไม่ได้ (`DB_SERVER` / รหัส / firewall)

**หน้าเว็บขึ้นแต่ล็อกอินหลุดบน HTTPS**  
ตั้ง `TRUST_PROXY=1` และ `COOKIE_SECURE=true`

**OTP ไม่ส่ง**  
ตรวจ `SMTP_USER` / `SMTP_PASS` ใน `.env` ของ container
