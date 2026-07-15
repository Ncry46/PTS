const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');
const session = require('express-session');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 🌟 2. เปิดใช้งานระบบจำสิทธิ์ (Session) ยึดตามเบราว์เซอร์
app.use(session({
    secret: 'your-secret-key-pts-academy', // เปลี่ยนคีย์ความปลอดภัยได้ตามใจชอบ
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // อยู่ได้นาน 24 ชั่วโมง
}));

// 1. ตัวเปิดสิทธิ์โฟลเดอร์หน้าบ้านเดิมของคุณ (ดึงจากระดับโฟลเดอร์ชั้นนอก)
app.use(express.static(path.join(__dirname, '..', 'frontend')));
// 2. 🌟 เพิ่มบรรทัดนี้: เปิดสิทธิ์ให้เบราว์เซอร์เข้าถึงโฟลเดอร์ components ข้างนอกได้
app.use('/comp', express.static(path.join(__dirname, '..', 'components')));

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
    res.sendFile(path.join(__dirname, '..', 'frontend', 'Home.html'));
});

// 🌟 3. [เพิ่มใหม่] API สำหรับส่งข้อมูลคนล็อกอินไปให้ navbar.js หน้าบ้านเอาไปวาด
app.get('/api/users/me', (req, res) => {
    if (req.session && req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false, user: null });
    }
});

// 🌟 4. [เพิ่มใหม่] API สำหรับการล็อกเอาต์ (ล้างค่าในเซิร์ฟเวอร์)
app.post('/api/users/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ success: false, message: 'ไม่สามารถออกจากระบบได้' });
        res.clearCookie('connect.sid'); // ล้างคุกกี้ Session บนเบราว์เซอร์
        res.json({ success: true, message: 'ออกจากระบบเรียบร้อย' });
    });
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
            // 🌟 5. แก้ไข SQL ดึงคอลัมน์ Role และ FlagUse เพิ่มเติมเข้ามา
            .query('SELECT email, full_name, Role, FlagUse FROM BD_PTS.dbo.users_main WHERE email = @email AND password_hash = @pass');

        if (result.recordset.length > 0) {
            const userData = result.recordset[0];

            // 🌟 6. เช็กก่อนว่าบัญชีผู้ใช้ถูกปิดใช้งาน (FlagUse == 'N') หรือไม่
            if (userData.FlagUse === 'N') {
                return res.status(403).json({ success: false, message: 'บัญชีนี้ถูกระงับการใช้งานชั่วคราว' });
            }

            // 🌟 7. จัดเก็บข้อมูลลงในเซสชันของหลังบ้าน
            req.session.user = {
                name: userData.full_name,
                email: userData.email,
                // แปลงสิทธิ์เป็นตัวพิมพ์เล็ก (เช่น admin / student) เพื่อให้ตรงกับโค้ด navbar.js
                role: userData.Role ? userData.Role.toLowerCase() : 'student' 
            };

            res.json({ 
                success: true, 
                message: `เข้าสู่ระบบสำเร็จ! สวัสดีคุณ ${userData.full_name}`,
                role: req.session.user.role
            });
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
// -------------------------------------------------------------------------
// 📚 [API ดึงข้อมูลคอร์สเรียน] ดึงข้อมูลจากตาราง courses_main
// -------------------------------------------------------------------------
app.get('/api/courses', async (req, res) => {
    try {
        // 1. เรียกใช้งาน Pool การเชื่อมต่อ SQL Server ตัวเดิมของคุณ
        const pool = await poolPromise;
        
        // 2. ยิงคำสั่ง SELECT เพื่อดึงข้อมูลฟิลด์ที่ต้องการใช้งาน
        // (แนะนำให้เลือกเฉพาะคอลัมน์ที่จำเป็น เพื่อความเร็วในการโหลด)
        const result = await pool.request()
            .query(`
                SELECT 
                    course_id, 
                    course_name, 
                    instructor_name, 
                    delivery_mode, 
                    difficulty_level, 
                    total_hours, 
                    average_rating, 
                    total_reviews, 
                    cover_image_url, -- 🌟 ตรงนี้เก็บ Absolute URL ของรูปปกคอร์สเรียนไว้แล้ว
                    is_featured
                FROM BD_PTS.dbo.courses_main
                ORDER BY created_at DESC -- ดึงคอร์สที่สร้างใหม่ขึ้นก่อน
            `);

        // 3. ส่งข้อมูลกลับไปให้หน้าบ้านเป็นรูปแบบ JSON Array
        res.json({
            success: true,
            data: result.recordset // ข้อมูลคอร์สทั้งหมดจะอยู่ในนี้
        });

    } catch (error) {
        console.error("❌ ดึงข้อมูลคอร์สล้มเหลว:", error.message);
        res.status(500).json({ 
            success: false, 
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลคอร์สเรียนจากฐานข้อมูล' 
        });
    }
});


// =========================================================================
// 🎯 API สำหรับดึงข้อมูลโพสต์คอมมูนิตี้ (ดึงข้อมูลจาก SQL Server ส่งให้หน้าบ้าน)
// =========================================================================
app.get('/api/community', async (req, res) => {
    try {
        // 1. เชื่อมต่อฐานข้อมูล SQL Server
        const pool = await poolPromise; 
        
        // 2. ส่งคิวรีดึงข้อมูลโพสต์พร้อม JOIN ตารางผู้ใช้เพื่อเอารูปโปรไฟล์และชื่อ
        const result = await pool.request().query(`
            SELECT 
                p.post_id,
                p.content,
                p.created_at,
                u.full_name AS author_name,
                
                -- 🌟 ดึงลิงก์รูปโปรไฟล์จำลองหรือรูปจริงที่เราทำไว้ระดับ SQL 
                ISNULL(u.Url, 'https://ui-avatars.com/api/?name=' + LEFT(u.full_name, 1) + '&background=F8BBD0&color=880E4F&size=128') AS author_avatar,
                
                -- 🌟 นับจำนวน Likes สด ๆ จากตารางความสัมพันธ์
                (SELECT COUNT(*) FROM post_likes WHERE post_id = p.post_id) AS like_count,
                
                -- 🌟 นับจำนวน Comments สด ๆ จากตารางความสัมพันธ์
                (SELECT COUNT(*) FROM post_comments WHERE post_id = p.post_id) AS comment_count
            FROM 
                community_posts p
            INNER JOIN 
                users_main u ON p.user_id = u.user_id
            WHERE 
                p.flag_use = 1 -- ดึงเฉพาะโพสต์ที่ยังไม่ถูกลบ
            ORDER BY 
                p.created_at DESC; -- โพสต์ล่าสุดขึ้นก่อน
        `);

        // 3. ส่งข้อมูลกลับไปหาหน้าบ้านในรูปแบบ JSON format สำเร็จรูป
        res.json({ 
            success: true, 
            data: result.recordset 
        });

    } catch (error) {
        console.error('❌ ดึงข้อมูลคอมมูนิตี้ล้มเหลว:', error);
        res.status(500).json({ 
            success: false, 
            message: 'เกิดข้อผิดพลาดภายในระบบหลังบ้าน: ' + error.message 
        });
    }
});
// =========================================================================
// 🎯 API สำหรับดึงข้อมูลแฮชแท็กยอดนิยม (Trending Topics)
// =========================================================================
app.get('/api/community/trending', async (req, res) => {
    try {
        const pool = await poolPromise;
        
        // ดึงแฮชแท็กที่มียอดโพสต์สูงสุด 5 อันดับแรก
        const result = await pool.request().query(`
            SELECT TOP (5) tag_id, tag_name, post_count
            FROM hashtags
            ORDER BY post_count DESC;
        `);

        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error('❌ ดึงข้อมูล Trending ล้มเหลว:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));