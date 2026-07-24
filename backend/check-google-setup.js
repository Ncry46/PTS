/**
 * ตรวจว่าเครื่องนี้พร้อมใช้ Google Calendar / Login หรือยัง
 * (ไม่พิมพ์ secret เต็ม)
 *
 *   npm run google:check
 *   node backend/check-google-setup.js
 */
const path = require('path');
const fs = require('fs');

try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (_) { /* optional */ }

const googleCalendar = require('./googleCalendar');
if (typeof googleCalendar.hydrateGoogleEnvFromLocal === 'function') {
    googleCalendar.hydrateGoogleEnvFromLocal();
}

const d = googleCalendar.diagnoseGoogleSetup();
const ok = d.configured;

console.log('');
console.log('=== PTS Google setup check ===');
console.log(ok ? '✓ พร้อมใช้งานบนเครื่องนี้' : '✗ เครื่องนี้ยังไม่พร้อม (เลย Settings ขึ้นว่าไม่มี Client ID/Secret)');
console.log('');
console.log('ไฟล์ลับ (git ไม่ส่งต่อ — เลยเพื่อนมี แต่เครื่องเราอาจไม่มี):');
console.log('  backend/google.local.js :', d.hasLocalFile ? `มี (${d.fileEncodingGuess}, ${d.fileBytes} bytes)` : 'ไม่พบ');
console.log('  .env GOOGLE_CLIENT_ID   :', d.envHasClientId ? 'มีค่า' : 'ว่าง');
console.log('  .env GOOGLE_CLIENT_SECRET:', d.envHasClientSecret ? 'มีค่า' : 'ว่าง');
console.log('  clientId hint           :', d.clientIdHint || '(ไม่มี)');
console.log('  redirectUri             :', d.redirectUri);
console.log('  appBaseUrl              :', d.appBaseUrl);
console.log('');

if (!ok) {
    console.log('ทำไมเพื่อนรันได้แต่เรารันไม่ได้?');
    console.log('  เพราะ google.local.js / .env ถูกใส่ใน .gitignore — git pull ไม่ได้พา Client ID/Secret มา');
    console.log('');
    console.log('แก้แบบใดแบบหนึ่ง:');
    console.log('  1) ขอไฟล์จากเพื่อน แล้วรัน:');
    console.log('       node backend/write-google-local.js --from พาธ\\google.local.jsของเพื่อน');
    console.log('  2) หรือใส่ค่าเองจาก Google Cloud:');
    console.log('       node backend/write-google-local.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET');
    console.log('  3) แล้วรีสตาร์ท: npm start');
    console.log('');
    console.log('ตรวจอีกครั้ง: npm run google:check');
    console.log('ในเบราว์เซอร์: http://localhost:3000/api/google/diagnose');
    process.exit(1);
}

console.log('ขั้นตอนถัดไป:');
console.log('  1) npm start');
console.log('  2) เปิด Settings → เชื่อมต่อ Google Calendar');
console.log('  3) เปิดสวิตช์แจ้งเตือน → ซิงค์ตารางเรียน');
console.log('');

// Warn if local file encoding was weird (already healed on read, but note it)
if (String(d.fileEncodingGuess || '').startsWith('utf16')) {
    console.log('⚠ ไฟล์เคยเป็น UTF-16 — ระบบพยายามซ่อมแล้ว ถ้ายังพังให้รัน write-google-local.js ใหม่');
}

const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    console.log('⚠ ไม่พบไฟล์ .env — คัดลอกจาก .env.example แล้วกรอกค่า DB ด้วย');
}
