# เก็บรูปบน Google Drive — คู่มือละเอียด PTS Learning

ใช้ได้บน **localhost** ไม่ต้องมีโดเมนออนไลน์

เมื่อตั้งค่าครบ:
- อัปโหลด **รูปโปรไฟล์** → ขึ้น Google Drive
- อัปโหลด **สลิปโอนเงิน** → ขึ้น Google Drive  
ถ้ายังไม่ตั้งค่า ระบบจะเก็บในโฟลเดอร์ `uploads/` บนเครื่องเหมือนเดิม

---

## สิ่งที่ต้องเตรียม
- บัญชี Google (Gmail / Workspace)
- โปรเจกต์ PTS บนเครื่อง เช่น `C:\Users\Admin_Support\Desktop\PA\PTS`
- ดึงโค้ดล่าสุดที่มีฟีเจอร์ Drive แล้ว

---

## ขั้นที่ 1 — สร้าง / เลือกโปรเจกต์ใน Google Cloud

1. เปิดเบราว์เซอร์ไปที่  
   https://console.cloud.google.com/
2. มุมบนซ้าย คลิกชื่อโปรเจกต์ (หรือ **Select a project**)
3. ถ้ายังไม่มีโปรเจกต์:
   - กด **New Project**
   - ชื่อ เช่น `PTS Learning`
   - กด **Create**
4. เลือกโปรเจกต์นั้นให้เป็นโปรเจกต์ที่กำลังใช้อยู่

> ถ้าเคยทำ Google Login / Calendar ไว้แล้ว ใช้โปรเจกต์เดิมได้เลย

---

## ขั้นที่ 2 — เปิด Google Drive API

1. เมนูซ้าย (≡) → **APIs & Services** → **Library**  
   หรือเปิดตรงๆ: https://console.cloud.google.com/apis/library
2. ในช่องค้นหา พิมพ์: `Google Drive API`
3. คลิกผลลัพธ์ **Google Drive API**
4. กดปุ่ม **Enable** (เปิดใช้)
5. รอจนขึ้นว่าเปิดแล้ว

---

## ขั้นที่ 3 — สร้าง Service Account

Service Account = “บัญชีหุ่นยนต์” ให้เซิร์ฟเวอร์ PTS อัปไฟล์เข้า Drive แทนคุณ

1. ไปที่ **APIs & Services** → **Credentials**  
   https://console.cloud.google.com/apis/credentials
2. กด **+ Create credentials**
3. เลือก **Service account**
4. กรอก:
   - **Service account name:** `pts-drive`
   - **Service account ID:** จะขึ้นอัตโนมัติ (ไม่ต้องแก้ก็ได้)
5. กด **Create and continue**
6. หน้า “Grant this service account access to project”  
   - ข้ามได้ (กด **Continue**) หรือเลือก Role `Editor` ก็ได้
7. หน้าถัดไป กด **Done**

ตอนนี้จะเห็น Service account ในรายการ Credentials

---

## ขั้นที่ 4 — สร้างไฟล์กุญแจ JSON

1. ในหน้า Credentials คลิกชื่อ Service account ที่สร้าง (`pts-drive`)
2. ไปแท็บ **Keys**
3. กด **Add key** → **Create new key**
4. เลือก **JSON** → กด **Create**
5. เบราว์เซอร์จะดาวน์โหลดไฟล์ เช่น  
   `pts-learning-xxxxx.json`

### ย้ายไฟล์มาที่โปรเจกต์
1. เปลี่ยนชื่อไฟล์เป็น:

```text
google-service-account.json
```

2. วางไฟล์ที่:

```text
C:\Users\Admin_Support\Desktop\PA\PTS\backend\google-service-account.json
```

3. **ห้ามอัปไฟล์นี้ขึ้น GitHub** (โปรเจกต์ ignore ไว้แล้ว)

### เปิดดู email ของ Service Account
เปิดไฟล์ JSON ด้วย Notepad หาช่อง:

```json
"client_email": "pts-drive@ชื่อโปรเจกต์.iam.gserviceaccount.com"
```

**คัดลอกค่า email นี้ไว้** จะใช้แชร์โฟลเดอร์ในขั้นถัดไป

---

## ขั้นที่ 5 — สร้างโฟลเดอร์ใน Google Drive และแชร์

1. เปิด https://drive.google.com/ ด้วยบัญชี Google ที่อยากเก็บรูป
2. กด **+ New** → **New folder**
3. ชื่อโฟลเดอร์ เช่น `PTS Uploads` → **Create**
4. คลิกขวาโฟลเดอร์ `PTS Uploads` → **Share** (แชร์)
5. ในช่อง Add people วาง **client_email** จากไฟล์ JSON
6. สิทธิ์เลือก **Editor** (แก้ไขได้)
7. ปิดแจ้งเตือนอีเมลได้ (Uncheck notify) → กด **Share** / **Send**

> สำคัญ: ต้องแชร์โฟลเดอร์ให้ Service Account จริงๆ ไม่งั้นอัปโหลดไม่ได้

---

## ขั้นที่ 6 — คัดลอก Folder ID

1. ดับเบิลคลิกเปิดโฟลเดอร์ `PTS Uploads`
2. ดูแถบที่อยู่เบราว์เซอร์ จะประมาณ:

```text
https://drive.google.com/drive/folders/1aBcDEfghIJkLmNoPqRsTuVwXyZ
```

3. คัดลอกเฉพาะส่วนหลัง `/folders/`  
   เช่น `1aBcDEfghIJkLmNoPqRsTuVwXyZ`  
   นี่คือ **GOOGLE_DRIVE_FOLDER_ID**

---

## ขั้นที่ 7 — ใส่ค่าในไฟล์ `.env`

1. เปิดไฟล์:

```text
C:\Users\Admin_Support\Desktop\PA\PTS\.env
```

2. เพิ่มหรือแก้บรรทัดเหล่านี้ (ใส่ของจริงของคุณ):

```bash
GOOGLE_DRIVE_FOLDER_ID=1aBcDEfghIJkLmNoPqRsTuVwXyZ
GOOGLE_SERVICE_ACCOUNT_FILE=backend/google-service-account.json
```

3. บันทึกไฟล์

### หรือใส่ใน `google.local.js` ก็ได้
ถ้ามีไฟล์ `backend\google.local.js` อยู่แล้ว เพิ่ม:

```js
driveFolderId: '1aBcDEfghIJkLmNoPqRsTuVwXyZ',
serviceAccountFile: 'backend/google-service-account.json'
```

---

## ขั้นที่ 8 — รีสตาร์ทเซิร์ฟเวอร์

ใน PowerShell:

```powershell
cd C:\Users\Admin_Support\Desktop\PA\PTS
npm start
```

ดูข้อความตอนสตาร์ท ควรมี:

```text
☁ Google Drive: configured ✓
```

### ถ้าขึ้น NOT configured
ตรวจทีละข้อ:
- [ ] มีไฟล์ `backend\google-service-account.json` จริง
- [ ] ใน `.env` มี `GOOGLE_DRIVE_FOLDER_ID=...` ไม่เว้นว่าง
- [ ] เปิดใช้ **Google Drive API** แล้ว
- [ ] แชร์โฟลเดอร์ให้ `client_email` แบบ Editor แล้ว
- [ ] บันทึก `.env` แล้วรีสตาร์ทใหม่

เช็กสถานะผ่านเบราว์เซอร์ได้ที่:

```text
http://localhost:3000/api/google/drive-status
```

ควรได้ `"configured": true`

---

## ขั้นที่ 9 — ทดสอบอัปโหลด

1. เปิดเว็บ `http://localhost:3000`
2. เข้าสู่ระบบ
3. ไป **ตั้งค่า (Settings)**
4. กดแก้ไขโปรไฟล์ → เลือกรูป → บันทึก
5. ถ้าสำเร็จ ข้อความจะประมาณ  
   **อัปเดตรูปโปรไฟล์แล้ว (เก็บบน Google Drive)**
6. กลับไปโฟลเดอร์ `PTS Uploads` ใน Google Drive  
   ควรเห็นไฟล์รูปใหม่

---

## สรุปไฟล์ที่เกี่ยวข้อง

| ไฟล์ / ค่า | ความหมาย |
|---|---|
| `backend/google-service-account.json` | กุญแจ Service Account (ลับ) |
| `GOOGLE_DRIVE_FOLDER_ID` | รหัสโฟลเดอร์ Drive |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | path ไปยังไฟล์ JSON |
| `GOOGLE_CLIENT_ID` / `SECRET` | สำหรับ Login/Calendar — คนละอย่างกับ Drive |

---

## คำถามที่พบบ่อย

**ถาม: ต้องมีโดเมน https ไหม?**  
ตอบ: ไม่ต้อง สำหรับเก็บรูปบน Drive ใช้ localhost ได้

**ถาม: ต่างจากปุ่มเข้าสู่ระบบด้วย Google ยังไง?**  
ตอบ: Login/Calendar ใช้ OAuth Client ID ส่วนเก็บรูปใช้ Service Account + โฟลเดอร์ Drive

**ถาม: รูปใครก็เห็นได้ไหม?**  
ตอบ: ระบบตั้งสิทธิ์ “ใครมีลิงก์ดูได้” เพื่อให้เว็บโชว์รูปได้ — อย่าอัปไฟล์ลับมากในโฟลเดอร์นี้

**ถาม: แบนเนอร์หน้าแรกขึ้น Drive ด้วยไหม?**  
ตอบ: ยังเก็บใน `uploads/hero/` ก่อน ตอนนี้ Drive ใช้กับโปรไฟล์ + สลิป
