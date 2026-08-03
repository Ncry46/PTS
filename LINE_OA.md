# LINE Official Account — PTS Learning

ให้ใช้งานใน LINE ได้ง่าย และยังคุมธีม PTS (`#974258`)

## สิ่งที่ได้ในระบบ

1. **แอปใน LINE** — หน้า `LineApp.html` (เมนูด่วน: คอร์สของฉัน / ตาราง / หลักสูตร / แจ้งเตือน) ใช้ธีม PTS + dark/light
2. **Webhook Messaging API** — `POST /api/line/webhook`  
   - เพิ่มเพื่อน → ส่ง Flex เมนูสี PTS  
   - พิมพ์ข้อความทั่วไป / “เมนู” → เมนูด่วน  
   - พิมพ์ “คอร์ส” / “ตาราง” / “ของฉัน” → ปุ่มลิงก์ไปหน้าเว็บ
3. **เชื่อมบัญชี** — ผูก LINE user กับบัญชี PTS (`line_account_links`) จาก LIFF
4. **แจ้งเตือนใน LINE** — เมื่อมี notification ในเว็บ และผู้ใช้เปิดรับแจ้งเตือน LINE จะได้ Flex ด้วย
5. **ตั้งค่า** — `Settings.html#line-oa` เปิดแอป / เพิ่มเพื่อน / ยกเลิกการเชื่อม

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

### 4) Rich Menu (ทำใน LINE OA Manager)
ตั้งปุ่มเมนูชี้ไป:
- หน้าหลักแอป: `https://liff.line.me/YOUR_LIFF_ID`
- หรือ `https://YOUR_DOMAIN/LineApp.html`
- คอร์สของฉัน / ตารางเรียน ตามต้องการ

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

ตอนสตาร์ทจะเห็นประมาณ:

```text
💬 LINE OA → addFriend=yes messaging=yes liff=yes
```

## ใช้งานฝั่งผู้เรียน

1. เพิ่มเพื่อน OA
2. กดเมนู / พิมพ์อะไรก็ได้ → ได้การ์ดสี PTS
3. เปิดแอปใน LINE → เข้าสู่ระบบ PTS (ครั้งแรก) → กด **เชื่อมด้วย LINE**
4. ตั้งค่า → LINE OA จะขึ้นว่าเชื่อมแล้ว และรับแจ้งเตือนในแชทได้

## หมายเหตุ

- `google.local.js` / `mail.local.js` ไม่เกี่ยวกับ LINE — ตั้งใน `.env` ตามด้านบน
- โดเมนต้องเป็น HTTPS สาธารณะถึง Webhook/LIFF จะใช้งานได้
- Cookie session ใช้ร่วมกับเว็บ — ถ้าเปิดใน LIFF แล้วล็อกอินไม่ติด ตรวจ `COOKIE_SECURE=true` และ `COOKIE_SAMESITE=none` บน HTTPS
