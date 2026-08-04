# เก็บรูปบน Google Drive — PTS Learning

ตอนนี้ระบบอัปโหลดรูปโปรไฟล์และสลิปโอนเงินได้ 2 แบบ:

1. **ยังไม่ตั้ง Drive** → เก็บในโฟลเดอร์ `uploads/` บนเครื่องเหมือนเดิม  
2. **ตั้ง Drive แล้ว** → อัปขึ้น Google Drive อัตโนมัติ (ถ้าพลาดจะถอยกลับไปเก็บในเครื่อง)

ใช้ได้บน **localhost** ได้เลย ไม่ต้องมีโดเมนสาธารณะ

---

## ตั้งค่าทีละขั้น (บน Google Cloud)

### 1) เปิด Drive API
1. ไป [Google Cloud Console](https://console.cloud.google.com/)
2. เลือกโปรเจกต์เดียวกับที่ทำ Google Login/Calendar (หรือสร้างใหม่)
3. **APIs & Services → Library** → ค้นหา **Google Drive API** → **Enable**

### 2) สร้าง Service Account
1. **APIs & Services → Credentials → Create credentials → Service account**
2. ตั้งชื่อ เช่น `pts-drive`
3. สร้างเสร็จ → เข้า Service account นั้น → แท็บ **Keys**
4. **Add key → Create new key → JSON** → ดาวน์โหลดไฟล์
5. ย้ายไฟล์มาไว้ที่โปรเจกต์:

```text
C:\Users\Admin_Support\Desktop\PA\PTS\backend\google-service-account.json
```

(ไฟล์นี้ถูก ignore จาก git แล้ว อย่าอัปขึ้น GitHub)

### 3) สร้างโฟลเดอร์ใน Google Drive
1. เปิด [Google Drive](https://drive.google.com/) ด้วยบัญชีที่ต้องการเก็บรูป
2. สร้างโฟลเดอร์ เช่น `PTS Uploads`
3. คลิกขวาโฟลเดอร์ → **Share**
4. ใส่ **email ของ Service Account** (อยู่ใน JSON ช่อง `client_email` เช่น `pts-drive@....iam.gserviceaccount.com`)
5. สิทธิ์ **Editor** → แชร์
6. เปิดโฟลเดอร์ ดู URL จะประมาณ:

```text
https://drive.google.com/drive/folders/1ABC...xyz
```

เอาเฉพาะส่วนหลัง `/folders/` มาเป็น `GOOGLE_DRIVE_FOLDER_ID`

### 4) ใส่ใน `.env`

```bash
GOOGLE_DRIVE_FOLDER_ID=1ABC...xyz
GOOGLE_SERVICE_ACCOUNT_FILE=backend/google-service-account.json
```

หรือใส่ใน `backend/google.local.js`:

```js
driveFolderId: '1ABC...xyz',
serviceAccountFile: 'backend/google-service-account.json'
```

### 5) รีสตาร์ท

```powershell
npm start
```

ตอนสตาร์ทควรเห็นประมาณ:

```text
☁ Google Drive: configured ✓
```

---

## ทดสอบ
1. เข้าสู่ระบบ → **ตั้งค่า** → อัปโหลดรูปโปรไฟล์
2. ถ้าสำเร็จ ข้อความจะบอกว่าเก็บบน Google Drive
3. เปิดโฟลเดอร์ใน Drive ควรเห็นไฟล์ใหม่

---

## หมายเหตุ
- OAuth Login/Calendar (`GOOGLE_CLIENT_ID`) คนละชุดกับ Service Account สำหรับ Drive  
  แต่ใช้โปรเจกต์ Cloud เดียวกันได้
- รูปที่อัปจะตั้งสิทธิ์ “anyone with the link can view” เพื่อให้เว็บแสดงรูปได้
- แบนเนอร์หน้าแรกยังเก็บใน `uploads/hero/` ก่อน (พึ่งพาชื่อไฟล์ในเครื่อง) — โปรไฟล์ + สลิปใช้ Drive ได้แล้ว
