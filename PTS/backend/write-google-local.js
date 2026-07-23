/**
 * เขียน backend/google.local.js แบบ UTF-8 ถูกต้อง (กัน PowerShell เขียน UTF-16)
 *
 * ใช้:
 *   node backend/write-google-local.js YOUR_CLIENT_ID YOUR_CLIENT_SECRET
 */
const fs = require('fs');
const path = require('path');

const clientId = process.argv[2] || process.env.GOOGLE_CLIENT_ID || '';
const clientSecret = process.argv[3] || process.env.GOOGLE_CLIENT_SECRET || '';

if (!clientId || !clientSecret) {
    console.error('ใช้แบบนี้: node backend/write-google-local.js <CLIENT_ID> <CLIENT_SECRET>');
    process.exit(1);
}

const out = path.join(__dirname, 'google.local.js');
const body = `module.exports = {
    clientId: ${JSON.stringify(clientId)},
    clientSecret: ${JSON.stringify(clientSecret)},
    redirectUri: 'http://localhost:3000/api/google/oauth/callback',
    appBaseUrl: 'http://localhost:3000'
};
`;
fs.writeFileSync(out, body, { encoding: 'utf8' });
console.log('Wrote', out);
console.log('clientId hint:', clientId.slice(0, 16) + '…');
