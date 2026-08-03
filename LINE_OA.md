# LINE Official Account — PTS Learning

ให้ใช้งานใน LINE ได้ง่าย และยังคุมธีม PTS (`#974258`)

## สิ่งที่ได้ในระบบ

1. **แอปใน LINE** — หน้า `LineApp.html` สไตล์แคตตาล็อกคอร์ส (พื้นม่วงอ่อน, การ์ดคอร์ส, ป้าย BEST SELLER / NEW, ฟิลเตอร์, แถบนำทางล่าง)
2. **Webhook Messaging API** — `POST /api/line/webhook`  
   - เพิ่มเพื่อน → การ์ดต้อนรับ + เมนู 2×2 สี PTS  
   - พิมพ์ “คอร์ส/สมัคร” → เลื่อนดูการ์ดหลักสูตร  
   - พิมพ์ “เมนู/ช่วยเหลือ” → เมนูด่วน  
3. **เชื่อมบัญชี** — ผูก LINE user กับบัญชี PTS จากแท็บโปรไฟล์ในแอป  
4. **แจ้งเตือนใน LINE** — การ์ดสไตล์แจ้งเตือน/ชำระเงิน ตามธีม PTS  
5. **Rich Menu** — สร้างเมนูล่าง 2×2 ด้วย `node backend/setup-line-rich-menu.js`  
6. **ตั้งค่า** — `Settings.html#line-oa`

## ตั้งค่าบน LINE Developers

### 1) Messaging API channel
1. สร้าง Provider → Messaging API channel สำหรับ OA
2. เปิด **Use webhooks**
3. Webhook URL: `https://YOUR_DOMAIN/api/line/webhook`
4. เปิด **Webhook** และ Verify
5. คัดลอก:
   - Channel ID → `LINE_CHANNEL_ID`
   - Channel secret → `LINE_CHANNEL_SECRET`
   - Channel access token (long-lived) → `LINE_CHANNEL_ACCESS_TOKEN`

### 2) LIFF app (แนะนำ)
1. ใน channel เดียวกัน (หรือ LINE Login) สร้าง LIFF
2. Endpoint URL: `https://YOUR_DOMAIN/LineApp.html`
3. Size: Full หรือ Tall
4. เปิด **LIFF** + ขอ profile / openid ตามต้องการ
5. คัดลอก LIFF ID → `LINE_LIFF_ID`

### 3) Add friend URL
จาก LINE Official Account Manager คัดลอกลิงก์เพิ่มเพื่อน เช่น  
`https://line.me/R/ti/p/@xxxx` → `LINE_OA_ADD_FRIEND_URL`

### 4) Rich Menu (เมนูล่างในแชท)
วิธีเร็ว (แนะนำ): บนเซิร์ฟเวอร์ที่ตั้ง `.env` แล้วรัน

```bash
node backend/setup-line-rich-menu.js
```

จะสร้างเมนู 2×2: คอร์สเรียน / สมัครเรียน / โปรไฟล์ / ช่วยเหลือ แล้วตั้งเป็นค่าเริ่มต้นให้ทุกคน

หรือตั้งเองใน LINE Official Account Manager ตามภาพ mock

### 5) ทำให้หน้าไม่ว่าง
1. รีสตาร์ท `npm start` หลังดึงโค้ดใหม่  
2. เปิด LIFF / `LineApp.html` — ต้องเห็นรายการคอร์ส  
3. ในแชท OA พิมพ์ `เมนู` หรือ `คอร์ส` — ต้องได้การ์ดสี PTS  
4. รันสคริปต์ Rich Menu ด้านบน เพื่อมีปุ่มล่างถาวร

## ค่าใน `.env`

```bash
LINE_OA_NAME=PTS Learning
LINE_OA_ADD_FRIEND_URL=https://line.me/R/ti/p/@your-oa-id
LINE_CHANNEL_ID=
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
LINE_LIFF_ID=
APP_BASE_URL=https://YOUR_DOMAIN
```

รีสตาร์ทเซิร์ฟเวอร์หลังแก้ `.env`

**สำคัญ: กัน 404 ใน LINE**
- ต้องตั้ง `APP_BASE_URL=https://โดเมนจริง` (มี `https://`)
- หรือตั้ง `LINE_LIFF_ID` ให้ปุ่มเปิดผ่าน `https://liff.line.me/...`
- อย่าใส่ลิงก์แบบ `/Courses.html` ใน Rich Menu / Flex — LINE เปิด relative path ไม่ได้
- ถ้า Flex มีรูป `logo.png` ที่เซิร์ฟเวอร์ไม่มี ข้อความอาจส่งไม่สำเร็จ (รอบแก้ล่าสุดเอา default นี้ออกแล้ว)

ตอนสตาร์ทจะเห็นประมาณ:

```text
💬 LINE OA → addFriend=yes messaging=yes liff=yes
```

## ทำไมในแชทยังเป็นข้อความโล่งๆ / ไม่สวย

ข้อความแบบ “สวัสดี คุณ :P …” มาจาก **Greeting Message ของ LINE OA Manager** ไม่ใช่จากระบบ PTS

ต้องทำครบนี้:

1. ดึงโค้ดล่าสุด + รีสตาร์ทเซิร์ฟเวอร์  
2. LINE Developers → Messaging API → **Webhook = On** และ Verify ผ่าน  
3. LINE Official Account Manager → **การตั้งค่า** → **การตอบกลับ**  
   - Response mode = **Bot**  
   - ปิด / ลบ **Greeting message** และ Auto-response ข้อความธรรมดา  
4. ใน `.env` ต้องมี `APP_BASE_URL=https://...` หรือ `LINE_LIFF_ID`  
5. รันเมนูล่าง: `node backend/setup-line-rich-menu.js`  
6. ทดสอบ: พิมพ์ในแชทว่า `สวัสดี` หรือ `เมนู`  
   หรือที่ Settings → LINE OA → **ส่งเมนูสวยเข้า LINE** (ต้องเชื่อมบัญชีก่อน)

หลังจากนั้นจะได้การ์ดต้อนรับสี PTS + เมนูปัดได้ 4 ใบ (คอร์ส / สมัคร / ตาราง / โปรไฟล์)

ชื่อ OA ด้านบนแชท (เช่น “ไม่ใช่เว็บสล็อต”) เปลี่ยนได้ที่ LINE OA Manager → โปรไฟล์บัญชี เท่านั้น

## ใช้งานฝั่งผู้เรียน

1. เพิ่มเพื่อน OA
2. กดเมนู / พิมพ์อะไรก็ได้ → ได้การ์ดสี PTS
3. เปิดแอปใน LINE → เข้าสู่ระบบ PTS (ครั้งแรก) → กด **เชื่อมด้วย LINE**
4. ตั้งค่า → LINE OA จะขึ้นว่าเชื่อมแล้ว และรับแจ้งเตือนในแชทได้

## หมายเหตุ

- `google.local.js` / `mail.local.js` ไม่เกี่ยวกับ LINE — ตั้งใน `.env` ตามด้านบน
- โดเมนต้องเป็น HTTPS สาธารณะถึง Webhook/LIFF จะใช้งานได้
- Cookie session ใช้ร่วมกับเว็บ — ถ้าเปิดใน LIFF แล้วล็อกอินไม่ติด ตรวจ `COOKIE_SECURE=true` และ `COOKIE_SAMESITE=none` บน HTTPS
