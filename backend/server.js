const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// 🔗 1. ตั้งค่าการเชื่อมต่อ Microsoft SQL Server
const dbConfig = {
    user: 'uinet',                       
    password: 'p@$$w0rd', // ⚠️ ตรวจสอบรหัสผ่าน SQL Server ของคุณให้ถูกต้องตรงนี้ครับ
    server: 'tvsdb2.thanvasupos.com',    
    port: 28914,                         
    database: 'BD_PTS',                  
    options: {
        encrypt: true,
        trustServerCertificate: true     
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(pool => {
        console.log('🔌 Connected to Microsoft SQL Server Successfully!');
        return pool;
    })
    .catch(err => {
        console.error('❌ SQL Server Connection Failed: ', err);
        process.exit(1);
    });

// 📦 ตัวเก็บข้อมูล Token สำหรับเช็ก OTP จริงผ่านเครือข่าย
const smsTokenCache = new Map();

// 🎯 ตั้งหน้าแรกสุด
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'frontend', 'Register.html'));
});

// -------------------------------------------------------------------------
// [API ล็อกอิน]
// -------------------------------------------------------------------------
app.post('/api/users/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('email', sql.VarChar, email)
            .input('pass', sql.VarChar, password)
            .query('SELECT email, full_name FROM BD_PTS.dbo.users_main WHERE email = @email AND password_hash = @pass');

        if (result.recordset.length > 0) {
            res.json({ success: true, message: `เข้าสู่ระบบสำเร็จ! สวัสดีคุณ ${result.recordset[0].full_name}` });
        } else {
            res.status(401).json({ success: false, message: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// -------------------------------------------------------------------------
// 📲 [API ส่งจริง] 1/2: ตรวจอีเมล และสั่ง Thaibulksms ยิง SMS เข้ามือถือจริง
// -------------------------------------------------------------------------
app.post('/api/users/request-otp', async (req, res) => {
    const { email, phone } = req.body;

    try {
        const pool = await poolPromise;
        // 1. ตรวจสอบข้อมูลอีเมลในระบบก่อน
        const userCheck = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT user_id FROM BD_PTS.dbo.users_main WHERE email = @email');

        if (userCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลผู้ใช้งานที่ตรงกับอีเมลนี้ในระบบ' });
        }

        // 🔑 ใช้คีย์จริงของคุณที่ผูกไว้กับหน้าเว็บ Thaibulksms
        const APP_KEY = 'NImQmVKGGJGNQY0CeoTuoDnMFcQVWm';
        const APP_SECRET = 'mRt76fWfedjje9tmydEUN7NXN3kCVe';
        const authKey = Buffer.from(`${APP_KEY}:${APP_SECRET}`).toString('base64');

        console.log(`📡 Sending actual SMS via Thaibulksms API to: ${phone}`);

        // 📲 2. ยิงตรงหา Server ของ Thaibulksms โดยตรงเพื่อส่งข้อความเข้าเบอร์มือถือจริง
        const smsResponse = await fetch('https://api.thaibulksms.com/v2/otp/request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authKey}`
            },
            body: JSON.stringify({
                key: APP_KEY,
                phone: phone, 
                digit: 6,
                expire: 300   // รหัสมีอายุ 5 นาที
            })
        });

        const smsData = await smsResponse.json();

        if (smsData && (smsData.token || (smsData.data && smsData.data.token))) {
            const activeToken = smsData.token || smsData.data.token;
            smsTokenCache.set(email, activeToken); // บันทึกไว้สอบด่านสอง
            
            res.json({ 
                success: true, 
                message: 'รหัส OTP ถูกส่งไปยังเบอร์มือถือจริงของคุณแล้ว!',
                token: activeToken 
            });
        } else {
            console.error("❌ Gateway Error Detail:", smsData);
            const errorMsg = smsData.errors ? smsData.errors[0].description : 'พารามิเตอร์ของระบบ API ไม่ถูกต้อง หรือเครดิต SMS หมด';
            res.status(400).json({ success: false, message: 'SMS Gateway ปฏิเสธการส่ง: ' + errorMsg });
        }

    } catch (error) {
        console.error("❌ Network Error:", error.message);
        res.status(500).json({ success: false, message: 'ระบบเครือข่ายหลังบ้านขัดข้อง: ' + error.message });
    }
});

// -------------------------------------------------------------------------
// 🔐 [API ส่งจริง] 2/2: ตรวจสอบ OTP ผ่าน Gateway และสั่งอัปเดตรหัสผ่านใหม่ลง SQL Server
// -------------------------------------------------------------------------
app.post('/api/users/verify-otp-reset', async (req, res) => {
    const { email, phone, token, otp, new_password } = req.body;

    try {
        const APP_KEY = 'NImQmVKGGJGNQY0CeoTuoDnMFcQVWm';
        const APP_SECRET = 'mRt76fWfedjje9tmydEUN7NXN3kCVe';
        const authKey = Buffer.from(`${APP_KEY}:${APP_SECRET}`).toString('base64');

        const savedToken = smsTokenCache.get(email);
        const tokenToVerify = token || savedToken;

        if (!tokenToVerify) {
            return res.status(400).json({ success: false, message: 'ไม่พบรหัสอ้างอิง Token กรุณากดขอ OTP ใหม่อีกครั้ง' });
        }

        // ส่งให้ Thaibulksms ตรวจความถูกต้องของตัวเลข
        const verifyResponse = await fetch('https://api.thaibulksms.com/v2/otp/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${authKey}`
            },
            body: JSON.stringify({
                token: tokenToVerify,
                pin: otp
            })
        });

        const verifyData = await verifyResponse.json();

        if (verifyData.status === 'success' && verifyData.code === 200) {
            const pool = await poolPromise;
            // ทำการ UPDATE รหัสผ่านจริงลงฐานข้อมูล
            await pool.request()
                .input('email', sql.VarChar, email)
                .input('phone', sql.VarChar, phone)
                .input('newPass', sql.VarChar, new_password)
                .query('UPDATE BD_PTS.dbo.users_main SET password_hash = @newPass WHERE email = @email');

            smsTokenCache.delete(email); // ลบ Token ทิ้งป้องกันการส่งซ้ำ
            res.json({ success: true, message: 'ยืนยันรหัส OTP ถูกต้อง และอัปเดตรหัสผ่านใหม่ลงระบบสำเร็จแล้ว!' });
        } else {
            res.status(400).json({ success: false, message: 'รหัส OTP ไม่ถูกต้อง หรือหมดเวลาการใช้งานแล้ว' });
        }

    } catch (error) {
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดภายในระบบฐานข้อมูลหลังบ้าน' });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));