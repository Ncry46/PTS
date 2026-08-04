/**
 * One-time setup: authorize YOUR Google account for Drive uploads.
 *
 * Why: Service Accounts often cannot upload into personal My Drive (0 quota).
 *
 * Usage:
 *   1) Ensure GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET work (same as Login)
 *   2) Ensure GOOGLE_DRIVE_FOLDER_ID is set
 *   3) node backend/setup-google-drive-oauth.js
 *   4) Open the printed URL, allow access, copy ?code=... from redirect URL
 *   5) Paste code when prompted
 *
 * Saves: backend/google.drive.token.json  (gitignored)
 */
const path = require('path');
const readline = require('readline');

try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}

const drive = require('./googleDrive');

function ask(q) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(q, (ans) => { rl.close(); resolve(String(ans || '').trim()); }));
}

async function main() {
    const status = drive.publicDriveStatus();
    const oauth = drive.getOAuthClient();
    console.log('Folder ID:', status.folderId || '(missing — set GOOGLE_DRIVE_FOLDER_ID)');
    console.log('OAuth client:', oauth.clientId ? oauth.clientId.slice(0, 20) + '…' : '(missing)');
    console.log('Redirect URI:', oauth.redirectUri);
    console.log('');

    if (!status.folderConfigured) {
        console.error('ตั้ง GOOGLE_DRIVE_FOLDER_ID ใน .env ก่อน');
        process.exit(1);
    }
    if (!oauth.clientId || !oauth.clientSecret) {
        console.error('ตั้ง GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (หรือ google.local.js) ก่อน');
        process.exit(1);
    }

    const url = drive.buildDriveAuthUrl('drive_storage');
    console.log('1) เปิดลิงก์นี้ในเบราว์เซอร์ แล้วอนุญาตสิทธิ์ Drive:\n');
    console.log(url);
    console.log('\n2) หลังอนุญาต จะเด้งไปหน้าเว็บ (อาจขึ้น error ก็ได้) — คัดลอกทั้ง URL');
    console.log('   แล้วหาค่า code=.... (ระหว่าง code= ถึง & ตัวถัดไป)\n');

    let code = await ask('วาง authorization code: ');
    if (code.includes('code=')) {
        try {
            const u = new URL(code);
            code = u.searchParams.get('code') || code;
        } catch (_) {
            const m = code.match(/code=([^&]+)/);
            if (m) code = decodeURIComponent(m[1]);
        }
    }
    if (!code) {
        console.error('ไม่มี code');
        process.exit(1);
    }

    const result = await drive.exchangeDriveCode(code);
    console.log('\nบันทึก refresh token แล้ว → backend/google.drive.token.json');
    if (result.email) console.log('บัญชี:', result.email);

    const probe = await drive.probeDriveUpload();
    if (probe.ok) {
        console.log('ทดสอบอัปโหลดสำเร็จ ✓ โหมด:', probe.mode);
        console.log('ต่อไป: npm start แล้วลองอัปรูปโปรไฟล์อีกครั้ง');
    } else {
        console.error('ทดสอบอัปโหลดยังไม่ผ่าน:', probe.error || probe);
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
