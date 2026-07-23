const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
try { require('dotenv').config({ path: path.join(__dirname, '..', '.env') }); } catch (_) {}
const { ensureLearningSchema, createNotification } = require('./ensureSchema');
const { createLearningRouter } = require('./learningRoutes');
const { createAdminRouter } = require('./adminRoutes');
const { createProfileRouter } = require('./profileRoutes');
const { createGoogleCalendarRouter } = require('./googleCalendarRoutes');
const { createGoogleAuthRouter } = require('./googleAuthRoutes');
const googleCalendar = require('./googleCalendar');
const { syncAfterEnroll } = googleCalendar;
const { issueEmailOtp, verifyEmailOtp, getMailStatus } = require('./emailOtp');
const { writeSecretsFile } = require('./mailSecrets');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

app.use(cors());
app.use(express.json());

// 🌟 2. เปิดใช้งานระบบจำสิทธิ์ (Session) ยึดตามเบราว์เซอร์
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-pts-academy',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.COOKIE_SECURE === 'true' || process.env.COOKIE_SECURE === '1',
        sameSite: process.env.COOKIE_SAMESITE || 'lax',
        maxAge: 24 * 60 * 60 * 1000 // อยู่ได้นาน 24 ชั่วโมง
    }
}));

const frontendDir = path.join(__dirname, '..', 'frontend');
const componentsDir = path.join(__dirname, '..', 'components');
const uploadsDir = path.join(__dirname, '..', 'uploads');

try {
    const { ensureHeroDir } = require('./heroImages');
    ensureHeroDir();
} catch (_) {
    try { fs.mkdirSync(path.join(uploadsDir, 'hero'), { recursive: true }); } catch (__) {}
    try { fs.mkdirSync(path.join(uploadsDir, 'avatars'), { recursive: true }); } catch (__) {}
}

// เสิร์ฟหน้าบ้านจาก frontend/
app.use(express.static(frontendDir));
// shared UI (navbar.js ฯลฯ) อยู่ที่ components/ — เสิร์ฟที่ / และ /comp
app.use(express.static(componentsDir));
app.use('/comp', express.static(componentsDir));
app.use('/comp', express.static(frontendDir)); // กันพาธเก่าที่เคยชี้ /comp ไปหน้า frontend
// รูปโปรไฟล์ / แบนเนอร์ที่อัปโหลด
app.use('/uploads', express.static(uploadsDir));

// Health check สำหรับ Docker / Render / โหลดบาลานเซอร์
app.get('/api/health', async (req, res) => {
    try {
        const pool = await poolPromise;
        await pool.request().query('SELECT 1 AS ok');
        res.json({ ok: true, db: true, service: 'pts-learning' });
    } catch (error) {
        res.status(503).json({
            ok: false,
            db: false,
            service: 'pts-learning',
            message: error.message || 'database unavailable'
        });
    }
});

// 🔗 1. ตั้งค่าการเชื่อมต่อ Microsoft SQL Server (override ได้ด้วย env / Docker)
const dbConfig = {
    user: process.env.DB_USER || 'uinet',
    password: process.env.DB_PASSWORD || 'p@$$w0rd',
    server: process.env.DB_SERVER || 'tvsdb2.thanvasupos.com',
    port: Number(process.env.DB_PORT) || 28914,
    database: process.env.DB_NAME || 'BD_PTS',
    options: {
        encrypt: process.env.DB_ENCRYPT !== 'false',
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false'
    },
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

// 📧 ตั้งค่าส่ง Email OTP — แนะนำตั้งผ่าน .env (SMTP_*) เมื่อรัน Docker
// ค่าด้านล่างเป็น fallback สำหรับรันในเครื่อง; mailSecrets อ่าน process.env ก่อน
const mailConfig = {
    mode: process.env.MAIL_MODE || 'smtp',
    smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || 'businessdev@thanvasu.com',
    smtpPass: process.env.SMTP_PASS || '',
    fromName: process.env.MAIL_FROM_NAME || 'PTS Learning',
    fromEmail: process.env.MAIL_FROM_EMAIL || process.env.MAIL_FROM || 'businessdev@thanvasu.com',
    brevoApiKey: process.env.BREVO_API_KEY || ''
};

try {
    if (mailConfig.smtpPass) {
        writeSecretsFile(mailConfig);
        console.log('📧 บันทึกค่า Email OTP จาก env/server.js → mail.local.js / mail.secrets.json');
    } else {
        console.log('📧 SMTP_PASS ว่าง — ใช้ mail.local.js / .env ที่มีอยู่ (ถ้ามี)');
    }
} catch (e) {
    console.error('⚠️ บันทึกค่าอีเมลไม่สำเร็จ:', e.message);
}

const poolPromise = new sql.ConnectionPool(dbConfig)
    .connect()
    .then(async pool => {
        console.log('🔌 Connected to Microsoft SQL Server Successfully!');
        try {
            await ensureLearningSchema(pool);
            console.log('📚 Learning schema ready');
        } catch (schemaErr) {
            console.error('⚠️ ไม่สามารถเตรียมตาราง learning ได้:', schemaErr.message);
        }
        const mail = getMailStatus();
        const localPath = path.join(__dirname, 'mail.local.js');
        console.log('📁 mail.local.js =', localPath, fs.existsSync(localPath) ? '(มีไฟล์)' : '(ไม่พบ)');
        if (mail.ready) {
            console.log(`📧 Email OTP ready → ส่งจาก ${mail.fromEmail || '-'} ผ่าน ${mail.smtpHost || mail.mode}`);
        } else {
            console.warn('⚠️ Email OTP ยังไม่พร้อม — ตรวจ mailConfig.smtpPass ใน server.js');
        }
        return pool;
    })
    .catch(err => {
        console.error('❌ SQL Server Connection Failed: ', err);
        process.exit(1);
    });

function requireLogin(req, res) {
    if (!req.session || !req.session.user || !req.session.user.user_id) {
        res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' });
        return null;
    }
    return req.session.user;
}

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
            .query(`
                SELECT user_id, email, full_name, Role, FlagUse, Url
                FROM BD_PTS.dbo.users_main
                WHERE email = @email AND password_hash = @pass
            `);

        if (result.recordset.length > 0) {
            const userData = result.recordset[0];

            // 🌟 6. เช็กก่อนว่าบัญชีผู้ใช้ถูกปิดใช้งาน (FlagUse == 'N') หรือไม่
            if (userData.FlagUse === 'N') {
                return res.status(403).json({ success: false, message: 'บัญชีนี้ถูกระงับการใช้งานชั่วคราว' });
            }

            // 🌟 7. จัดเก็บข้อมูลลงในเซสชันของหลังบ้าน
            req.session.user = {
                user_id: userData.user_id,
                name: userData.full_name,
                email: userData.email,
                Url: userData.Url || null,
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
// [API สมัครสมาชิก]
// -------------------------------------------------------------------------
app.post('/api/users/register', async (req, res) => {
    const { full_name, email, phone, password } = req.body;

    if (!full_name || !email || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกชื่อ อีเมล และรหัสผ่านให้ครบ' });
    }

    try {
        const pool = await poolPromise;

        const existing = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT user_id FROM BD_PTS.dbo.users_main WHERE email = @email');

        if (existing.recordset.length > 0) {
            return res.status(400).json({ success: false, message: 'อีเมลนี้เคยลงทะเบียนในระบบไว้แล้ว' });
        }

        await pool.request()
            .input('email', sql.VarChar, email)
            .input('fullName', sql.NVarChar, full_name)
            .input('phone', sql.VarChar, phone || '-')
            .input('pass', sql.VarChar, password)
            .query(`
                INSERT INTO BD_PTS.dbo.users_main (email, full_name, phone, password_hash, Role, FlagUse)
                VALUES (@email, @fullName, @phone, @pass, 'student', 'Y')
            `);

        const created = await pool.request()
            .input('email', sql.VarChar, email)
            .query(`SELECT user_id FROM BD_PTS.dbo.users_main WHERE email = @email`);
        if (created.recordset[0]) {
            try {
                await createNotification(
                    pool,
                    created.recordset[0].user_id,
                    'ยินดีต้อนรับสู่ PTS Learning',
                    'บัญชีของคุณพร้อมใช้งานแล้ว เริ่มเลือกหลักสูตรและเข้าร่วมคอมมูนิตี้ได้เลย',
                    'Courses.html'
                );
            } catch (notifyErr) {
                console.error('notify register:', notifyErr.message);
            }
        }

        res.json({ success: true, message: 'ลงทะเบียนสมาชิกสำเร็จแล้ว! กรุณาเข้าสู่ระบบ' });
    } catch (error) {
        console.error('❌ Register failed:', error.message);
        if (error.message && error.message.includes('UNIQUE')) {
            return res.status(400).json({ success: false, message: 'อีเมลนี้เคยลงทะเบียนในระบบไว้แล้ว' });
        }
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลงทะเบียน: ' + error.message });
    }
});

// -------------------------------------------------------------------------
// 📧 ลืมรหัสผ่าน: ส่ง OTP ทางอีเมล
// -------------------------------------------------------------------------
app.post('/api/users/request-otp', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!email) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกอีเมล' });
    }

    try {
        const pool = await poolPromise;
        const userCheck = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT user_id, email FROM BD_PTS.dbo.users_main WHERE email = @email');

        if (userCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งานที่ตรงกับอีเมลนี้' });
        }

        const userEmail = String(userCheck.recordset[0].email || email).trim();
        const issued = await issueEmailOtp(userEmail, 'reset');
        res.json({
            success: true,
            message: `ส่งรหัส OTP ไปที่อีเมลของผู้ใช้ ${issued.masked} แล้ว (ใช้ได้กับทุกอีเมลที่สมัครในระบบ) — ตรวจ inbox/สแปม หมดอายุใน 5 นาที`,
            masked_email: issued.masked,
            recipient_email: issued.masked,
            delivered: issued.delivered,
            expires_in_seconds: issued.expires_in_seconds
        });
    } catch (error) {
        console.error('❌ request email OTP:', error.message);
        const status = ['SMTP_NOT_CONFIGURED', 'MAIL_NOT_CONFIGURED', 'BREVO_NOT_CONFIGURED', 'MAIL_FROM_MISSING'].includes(error.code)
            ? 503
            : 500;
        res.status(status).json({
            success: false,
            message: error.message || 'ส่งอีเมล OTP ไม่สำเร็จ',
            code: error.code || null
        });
    }
});

// -------------------------------------------------------------------------
// 🔐 ลืมรหัสผ่าน: ยืนยัน OTP จากอีเมล แล้วตั้งรหัสผ่านใหม่
// -------------------------------------------------------------------------
app.post('/api/users/verify-otp-reset', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const otp = String(req.body.otp || '').trim();
    const newPassword = String(req.body.new_password || '');

    if (!email || !otp || !newPassword) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกอีเมล รหัส OTP และรหัสผ่านใหม่' });
    }
    if (newPassword.length < 4) {
        return res.status(400).json({ success: false, message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 4 ตัวอักษร' });
    }

    try {
        const checked = verifyEmailOtp(email, otp, 'reset');
        if (!checked.ok) {
            return res.status(400).json({ success: false, message: checked.message });
        }

        const pool = await poolPromise;
        const userCheck = await pool.request()
            .input('email', sql.VarChar, email)
            .query('SELECT user_id FROM BD_PTS.dbo.users_main WHERE email = @email');
        if (!userCheck.recordset.length) {
            return res.status(404).json({ success: false, message: 'ไม่พบผู้ใช้งาน' });
        }

        await pool.request()
            .input('email', sql.VarChar, email)
            .input('newPass', sql.VarChar, newPassword)
            .query('UPDATE BD_PTS.dbo.users_main SET password_hash = @newPass WHERE email = @email');

        res.json({ success: true, message: 'ยืนยัน OTP สำเร็จ และตั้งรหัสผ่านใหม่เรียบร้อยแล้ว' });
    } catch (error) {
        console.error('❌ verify email OTP reset:', error.message);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการรีเซ็ตรหัสผ่าน' });
    }
});
// -------------------------------------------------------------------------
// 📚 [API ดึงข้อมูลหลักสูตร] ดึงข้อมูลจากตาราง courses_main
// -------------------------------------------------------------------------
app.get('/api/courses', async (req, res) => {
    try {
        const pool = await poolPromise;
        const userId = req.session?.user?.user_id || null;

        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
                SELECT 
                    c.course_id, 
                    c.course_name, 
                    c.instructor_name, 
                    c.delivery_mode, 
                    c.difficulty_level, 
                    c.total_hours, 
                    c.average_rating, 
                    c.total_reviews, 
                    c.cover_image_url,
                    c.is_featured,
                    c.price,
                    c.description,
                    CASE
                        WHEN @userId IS NULL THEN 0
                        WHEN EXISTS (
                            SELECT 1 FROM BD_PTS.dbo.course_favorites f
                            WHERE f.user_id = @userId AND f.course_id = c.course_id
                        ) THEN 1 ELSE 0
                    END AS is_favorited,
                    CASE
                        WHEN @userId IS NULL THEN 0
                        WHEN EXISTS (
                            SELECT 1 FROM BD_PTS.dbo.course_enrollments e
                            WHERE e.user_id = @userId AND e.course_id = c.course_id
                        ) THEN 1 ELSE 0
                    END AS is_enrolled
                FROM BD_PTS.dbo.courses_main c
                ORDER BY c.created_at DESC
            `);

        res.json({
            success: true,
            loggedIn: !!userId,
            data: result.recordset
        });

    } catch (error) {
        console.error("❌ ดึงข้อมูลหลักสูตรล้มเหลว:", error.message);
        res.status(500).json({ 
            success: false, 
            message: 'เกิดข้อผิดพลาดในการดึงข้อมูลหลักสูตรจากฐานข้อมูล' 
        });
    }
});


// =========================================================================
// 🎯 API สำหรับดึงข้อมูลโพสต์คอมมูนิตี้ (ดึงข้อมูลจาก SQL Server ส่งให้หน้าบ้าน)
// =========================================================================
app.get('/api/community', async (req, res) => {
    try {
        const pool = await poolPromise;
        const userId = req.session?.user?.user_id || null;

        const result = await pool.request()
            .input('userId', sql.Int, userId)
            .query(`
            SELECT 
                p.post_id,
                p.content,
                p.created_at,
                u.full_name AS author_name,
                ISNULL(u.Url, 'https://ui-avatars.com/api/?name=' + LEFT(u.full_name, 1) + '&background=F8BBD0&color=880E4F&size=128') AS author_avatar,
                (SELECT COUNT(*) FROM post_likes WHERE post_id = p.post_id) AS like_count,
                (SELECT COUNT(*) FROM post_comments WHERE post_id = p.post_id) AS comment_count,
                CASE
                    WHEN @userId IS NULL THEN 0
                    WHEN EXISTS (
                        SELECT 1 FROM post_likes pl
                        WHERE pl.post_id = p.post_id AND pl.user_id = @userId
                    ) THEN 1 ELSE 0
                END AS liked_by_me
            FROM 
                community_posts p
            INNER JOIN 
                users_main u ON p.user_id = u.user_id
            WHERE 
                p.flag_use = 1
            ORDER BY 
                p.created_at DESC;
        `);

        res.json({ 
            success: true, 
            loggedIn: !!userId,
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

// โพสต์ที่ฉันกดถูกใจ
app.get('/api/my/liked-posts', async (req, res) => {
    const user = requireLogin(req, res);
    if (!user) return;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userId', sql.Int, user.user_id)
            .query(`
                SELECT
                    p.post_id,
                    p.content,
                    p.created_at,
                    u.full_name AS author_name,
                    ISNULL(u.Url, 'https://ui-avatars.com/api/?name=' + LEFT(u.full_name, 1) + '&background=F8BBD0&color=880E4F&size=128') AS author_avatar,
                    (SELECT COUNT(*) FROM post_likes WHERE post_id = p.post_id) AS like_count,
                    (SELECT COUNT(*) FROM post_comments WHERE post_id = p.post_id) AS comment_count,
                    1 AS liked_by_me
                FROM BD_PTS.dbo.post_likes pl
                INNER JOIN BD_PTS.dbo.community_posts p ON p.post_id = pl.post_id
                INNER JOIN BD_PTS.dbo.users_main u ON u.user_id = p.user_id
                WHERE pl.user_id = @userId AND p.flag_use = 1
                ORDER BY p.created_at DESC
            `);
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// หลักสูตรโปรด
app.get('/api/my/favorite-courses', async (req, res) => {
    const user = requireLogin(req, res);
    if (!user) return;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userId', sql.Int, user.user_id)
            .query(`
                SELECT
                    c.course_id, c.course_name, c.instructor_name, c.delivery_mode,
                    c.difficulty_level, c.total_hours, c.average_rating, c.total_reviews,
                    c.cover_image_url, c.is_featured, 1 AS is_favorited,
                    CASE WHEN e.enrollment_id IS NULL THEN 0 ELSE 1 END AS is_enrolled
                FROM BD_PTS.dbo.course_favorites f
                INNER JOIN BD_PTS.dbo.courses_main c ON c.course_id = f.course_id
                LEFT JOIN BD_PTS.dbo.course_enrollments e
                    ON e.course_id = c.course_id AND e.user_id = @userId
                WHERE f.user_id = @userId
                ORDER BY f.created_at DESC
            `);
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/courses/:courseId/favorite', async (req, res) => {
    const user = requireLogin(req, res);
    if (!user) return;

    const courseId = parseInt(req.params.courseId, 10);
    if (!courseId) return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });

    try {
        const pool = await poolPromise;
        const existing = await pool.request()
            .input('userId', sql.Int, user.user_id)
            .input('courseId', sql.Int, courseId)
            .query(`SELECT COUNT(*) AS cnt FROM BD_PTS.dbo.course_favorites WHERE user_id = @userId AND course_id = @courseId`);

        let favorited = false;
        if (existing.recordset[0].cnt > 0) {
            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .query(`DELETE FROM BD_PTS.dbo.course_favorites WHERE user_id = @userId AND course_id = @courseId`);
            favorited = false;
        } else {
            await pool.request()
                .input('userId', sql.Int, user.user_id)
                .input('courseId', sql.Int, courseId)
                .query(`INSERT INTO BD_PTS.dbo.course_favorites (user_id, course_id) VALUES (@userId, @courseId)`);
            favorited = true;
        }

        res.json({ success: true, favorited, message: favorited ? 'บันทึกหลักสูตรโปรดแล้ว' : 'นำออกจากหลักสูตรโปรดแล้ว' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
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

// =========================================================================
// ✍️ สร้างโพสต์คอมมูนิตี้ (ต้องล็อกอิน)
// =========================================================================
app.post('/api/community', async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.user_id) {
        return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนโพสต์' });
    }

    const content = (req.body.content || '').trim();
    if (!content) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อความก่อนโพสต์' });
    }
    if (content.length > 2000) {
        return res.status(400).json({ success: false, message: 'ข้อความยาวเกิน 2000 ตัวอักษร' });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userId', sql.Int, req.session.user.user_id)
            .input('content', sql.NVarChar, content)
            .query(`
                INSERT INTO BD_PTS.dbo.community_posts (user_id, content, flag_use, created_at)
                OUTPUT INSERTED.post_id, INSERTED.content, INSERTED.created_at
                VALUES (@userId, @content, 1, GETDATE())
            `);

        const created = result.recordset[0];
        res.json({
            success: true,
            message: 'โพสต์สำเร็จ',
            data: {
                post_id: created.post_id,
                content: created.content,
                created_at: created.created_at,
                author_name: req.session.user.name,
                author_avatar: req.session.user.Url || null,
                like_count: 0,
                comment_count: 0
            }
        });
    } catch (error) {
        console.error('❌ สร้างโพสต์ล้มเหลว:', error.message);
        res.status(500).json({ success: false, message: 'ไม่สามารถสร้างโพสต์ได้: ' + error.message });
    }
});

// =========================================================================
// ❤️ กดไลก์โพสต์ (สลับ like/unlike)
// =========================================================================
app.post('/api/community/:postId/like', async (req, res) => {
    if (!req.session || !req.session.user || !req.session.user.user_id) {
        return res.status(401).json({ success: false, message: 'กรุณาเข้าสู่ระบบก่อนกดไลก์' });
    }

    const postId = parseInt(req.params.postId, 10);
    if (!postId) {
        return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });
    }

    try {
        const pool = await poolPromise;
        const userId = req.session.user.user_id;

        const existing = await pool.request()
            .input('postId', sql.Int, postId)
            .input('userId', sql.Int, userId)
            .query('SELECT COUNT(*) AS cnt FROM BD_PTS.dbo.post_likes WHERE post_id = @postId AND user_id = @userId');

        let liked = false;
        if (existing.recordset[0].cnt > 0) {
            await pool.request()
                .input('postId', sql.Int, postId)
                .input('userId', sql.Int, userId)
                .query('DELETE FROM BD_PTS.dbo.post_likes WHERE post_id = @postId AND user_id = @userId');
            liked = false;
        } else {
            await pool.request()
                .input('postId', sql.Int, postId)
                .input('userId', sql.Int, userId)
                .query('INSERT INTO BD_PTS.dbo.post_likes (post_id, user_id) VALUES (@postId, @userId)');
            liked = true;
        }

        const countResult = await pool.request()
            .input('postId', sql.Int, postId)
            .query('SELECT COUNT(*) AS like_count FROM BD_PTS.dbo.post_likes WHERE post_id = @postId');

        res.json({
            success: true,
            liked,
            like_count: countResult.recordset[0].like_count
        });
    } catch (error) {
        console.error('❌ กดไลก์ล้มเหลว:', error.message);
        res.status(500).json({ success: false, message: 'ไม่สามารถกดไลก์ได้: ' + error.message });
    }
});

// =========================================================================
// 💬 คอมเมนต์โพสต์คอมมูนิตี้
// =========================================================================
app.get('/api/community/:postId/comments', async (req, res) => {
    const postId = parseInt(req.params.postId, 10);
    if (!postId) {
        return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('postId', sql.Int, postId)
            .query(`
                SELECT
                    c.comment_id,
                    c.post_id,
                    c.content,
                    c.created_at,
                    u.full_name AS author_name,
                    ISNULL(u.Url, 'https://ui-avatars.com/api/?name=' + LEFT(u.full_name, 1) + '&background=F8BBD0&color=880E4F&size=128') AS author_avatar
                FROM BD_PTS.dbo.post_comments c
                INNER JOIN BD_PTS.dbo.users_main u ON c.user_id = u.user_id
                WHERE c.post_id = @postId
                ORDER BY c.created_at ASC
            `);

        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error('❌ ดึงคอมเมนต์ล้มเหลว:', error.message);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงคอมเมนต์ได้: ' + error.message });
    }
});

app.post('/api/community/:postId/comments', async (req, res) => {
    const user = requireLogin(req, res);
    if (!user) return;

    const postId = parseInt(req.params.postId, 10);
    const content = (req.body.content || '').trim();
    if (!postId) {
        return res.status(400).json({ success: false, message: 'รหัสโพสต์ไม่ถูกต้อง' });
    }
    if (!content) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกคอมเมนต์' });
    }
    if (content.length > 1000) {
        return res.status(400).json({ success: false, message: 'คอมเมนต์ยาวเกิน 1000 ตัวอักษร' });
    }

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('postId', sql.Int, postId)
            .input('userId', sql.Int, user.user_id)
            .input('content', sql.NVarChar, content)
            .query(`
                INSERT INTO BD_PTS.dbo.post_comments (post_id, user_id, content, created_at)
                OUTPUT INSERTED.comment_id, INSERTED.post_id, INSERTED.content, INSERTED.created_at
                VALUES (@postId, @userId, @content, GETDATE())
            `);

        const created = result.recordset[0];
        res.json({
            success: true,
            message: 'คอมเมนต์สำเร็จ',
            data: {
                ...created,
                author_name: user.name,
                author_avatar: user.Url || null
            }
        });
    } catch (error) {
        console.error('❌ เพิ่มคอมเมนต์ล้มเหลว:', error.message);
        res.status(500).json({ success: false, message: 'ไม่สามารถคอมเมนต์ได้: ' + error.message });
    }
});

// =========================================================================
// 📘 สมัครเรียน / หลักสูตรของฉัน
// =========================================================================
app.post('/api/courses/:courseId/enroll', async (req, res) => {
    const user = requireLogin(req, res);
    if (!user) return;

    const courseId = parseInt(req.params.courseId, 10);
    if (!courseId) {
        return res.status(400).json({ success: false, message: 'รหัสหลักสูตรไม่ถูกต้อง' });
    }

    try {
        const pool = await poolPromise;

        const courseCheck = await pool.request()
            .input('courseId', sql.Int, courseId)
            .query('SELECT course_id, course_name FROM BD_PTS.dbo.courses_main WHERE course_id = @courseId');

        if (courseCheck.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบหลักสูตรนี้ในระบบ' });
        }

        const existing = await pool.request()
            .input('userId', sql.Int, user.user_id)
            .input('courseId', sql.Int, courseId)
            .query(`
                SELECT enrollment_id FROM BD_PTS.dbo.course_enrollments
                WHERE user_id = @userId AND course_id = @courseId
            `);

        if (existing.recordset.length > 0) {
            return res.json({
                success: true,
                already_enrolled: true,
                message: 'คุณสมัครหลักสูตรนี้ไว้แล้ว',
                enrollment_id: existing.recordset[0].enrollment_id
            });
        }

        const inserted = await pool.request()
            .input('userId', sql.Int, user.user_id)
            .input('courseId', sql.Int, courseId)
            .query(`
                INSERT INTO BD_PTS.dbo.course_enrollments (user_id, course_id, progress_percent, status)
                OUTPUT INSERTED.enrollment_id
                VALUES (@userId, @courseId, 0, 'in_progress')
            `);

        // ซิงค์ตารางเรียนเข้า Google Calendar (ถ้าผู้ใช้เชื่อมไว้แล้ว)
        syncAfterEnroll(pool, user.user_id, courseId).catch(() => {});

        res.json({
            success: true,
            already_enrolled: false,
            message: `สมัครเรียน "${courseCheck.recordset[0].course_name}" สำเร็จ`,
            enrollment_id: inserted.recordset[0].enrollment_id
        });
    } catch (error) {
        console.error('❌ สมัครเรียนล้มเหลว:', error.message);
        res.status(500).json({ success: false, message: 'ไม่สามารถสมัครเรียนได้: ' + error.message });
    }
});

app.get('/api/my/courses', async (req, res) => {
    const user = requireLogin(req, res);
    if (!user) return;

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userId', sql.Int, user.user_id)
            .query(`
                SELECT
                    e.enrollment_id,
                    e.progress_percent,
                    e.status,
                    e.enrolled_at,
                    e.updated_at,
                    c.course_id,
                    c.course_name,
                    c.instructor_name,
                    c.delivery_mode,
                    c.difficulty_level,
                    c.total_hours,
                    c.cover_image_url,
                    c.average_rating
                FROM BD_PTS.dbo.course_enrollments e
                INNER JOIN BD_PTS.dbo.courses_main c ON e.course_id = c.course_id
                WHERE e.user_id = @userId
                ORDER BY e.updated_at DESC
            `);

        const courses = result.recordset;
        const inProgress = courses.filter(c => c.status === 'in_progress');
        const completed = courses.filter(c => c.status === 'completed');
        const avgProgress = courses.length
            ? Math.round(courses.reduce((sum, c) => sum + Number(c.progress_percent || 0), 0) / courses.length)
            : 0;
        const totalHours = courses.reduce((sum, c) => sum + Number(c.total_hours || 0), 0);

        res.json({
            success: true,
            data: courses,
            summary: {
                total: courses.length,
                in_progress: inProgress.length,
                completed: completed.length,
                average_progress: avgProgress,
                total_hours: totalHours
            }
        });
    } catch (error) {
        console.error('❌ ดึงหลักสูตรของฉันล้มเหลว:', error.message);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงหลักสูตรของฉันได้: ' + error.message });
    }
});

app.patch('/api/my/courses/:courseId/progress', async (req, res) => {
    const user = requireLogin(req, res);
    if (!user) return;

    const courseId = parseInt(req.params.courseId, 10);
    let progress = parseInt(req.body.progress_percent, 10);
    if (!courseId || Number.isNaN(progress)) {
        return res.status(400).json({ success: false, message: 'ข้อมูลความคืบหน้าไม่ถูกต้อง' });
    }
    progress = Math.max(0, Math.min(100, progress));
    const status = progress >= 100 ? 'completed' : 'in_progress';

    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input('userId', sql.Int, user.user_id)
            .input('courseId', sql.Int, courseId)
            .input('progress', sql.Int, progress)
            .input('status', sql.VarChar, status)
            .query(`
                UPDATE BD_PTS.dbo.course_enrollments
                SET progress_percent = @progress,
                    status = @status,
                    updated_at = GETDATE()
                WHERE user_id = @userId AND course_id = @courseId;

                SELECT @@ROWCOUNT AS affected;
            `);

        if (!result.recordset[0] || result.recordset[0].affected === 0) {
            return res.status(404).json({ success: false, message: 'ยังไม่ได้สมัครหลักสูตรนี้' });
        }

        res.json({ success: true, message: 'อัปเดตความคืบหน้าแล้ว', progress_percent: progress, status });
    } catch (error) {
        console.error('❌ อัปเดตความคืบหน้าล้มเหลว:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// -------------------------------------------------------------------------
// 📸 Kiosk จำลอง: หน้า frontend/kiosk.html เป็นตัวทดสอบเท่านั้น
// เครื่อง Kiosk จริงให้ POST มาที่ endpoint นี้ด้วย payload เดียวกัน
// -------------------------------------------------------------------------
app.use('/api', createLearningRouter({ poolPromise, requireLogin }));
app.use('/api', createProfileRouter({ poolPromise, requireLogin }));
app.use('/api', createGoogleCalendarRouter({ poolPromise, requireLogin }));
app.use('/api', createGoogleAuthRouter({ poolPromise }));
app.use('/api/admin', createAdminRouter({ poolPromise, requireLogin }));

app.post('/api/attendance/scan', async (req, res) => {
    const { employee_id, kiosk_device_id } = req.body;

    if (!employee_id || !kiosk_device_id) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }

    try {
        const pool = await poolPromise;
        const now = new Date();
        const tzoffset = now.getTimezoneOffset() * 60000;
        const localISOTime = new Date(now.getTime() - tzoffset).toISOString().slice(0, 19).replace('T', ' ');
        const currentDateOnly = localISOTime.split(' ')[0];

        const userResult = await pool.request()
            .input('email', sql.VarChar, employee_id)
            .query(`
                SELECT full_name, email, Role
                FROM BD_PTS.dbo.users_main
                WHERE email = @email
            `);

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลสมาชิกคนนี้ในระบบ' });
        }

        const empInfo = userResult.recordset[0];

        const checkResult = await pool.request()
            .input('email', sql.VarChar, employee_id)
            .input('localDate', sql.VarChar, currentDateOnly)
            .query(`
                SELECT TOP 1 scan_type
                FROM BD_PTS.dbo.attendance_logs
                WHERE employee_id = @email AND CAST(scan_timestamp AS DATE) = CAST(@localDate AS DATE)
                ORDER BY log_id DESC
            `);

        let scan_type = 'IN';
        if (checkResult.recordset.length > 0 && checkResult.recordset[0].scan_type === 'IN') {
            scan_type = 'OUT';
        }

        let status = 'NORMAL';
        if (scan_type === 'IN' && now > new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 30, 0)) {
            status = 'LATE';
        }

        await pool.request()
            .input('email', sql.VarChar, employee_id)
            .input('scanTime', sql.DateTime, localISOTime)
            .input('scanType', sql.VarChar, scan_type)
            .input('kioskId', sql.VarChar, kiosk_device_id)
            .input('status', sql.VarChar, status)
            .query(`
                INSERT INTO BD_PTS.dbo.attendance_logs (employee_id, scan_timestamp, scan_type, kiosk_device_id, status)
                VALUES (@email, @scanTime, @scanType, @kioskId, @status)
            `);

        res.json({
            success: true,
            message: 'บันทึกเวลาสำเร็จ',
            data: {
                employee_name: empInfo.full_name,
                employee_code: empInfo.email,
                department: empInfo.Role || 'student',
                scan_time: now.toLocaleTimeString('th-TH'),
                scan_type: scan_type === 'IN' ? 'เข้างาน' : 'ออกงาน',
                status: status === 'LATE' ? 'มาสาย' : 'ปกติ'
            }
        });
    } catch (error) {
        console.error('❌ Attendance scan failed:', error.message);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบฐานข้อมูลหลังบ้าน' });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    try {
        const configured = typeof googleCalendar.isGoogleConfigured === 'function'
            && googleCalendar.isGoogleConfigured();
        const status = typeof googleCalendar.publicGoogleStatus === 'function'
            ? googleCalendar.publicGoogleStatus()
            : {};
        console.log(`📅 Google Calendar: ${configured ? 'configured ✓' : 'NOT configured — สร้าง backend/google.local.js'}`);
        if (status.redirectUri) console.log(`   redirectUri = ${status.redirectUri}`);
        const localG = path.join(__dirname, 'google.local.js');
        console.log(`   google.local.js = ${localG} ${fs.existsSync(localG) ? '(มีไฟล์)' : '(ไม่พบ)'}`);
    } catch (err) {
        console.warn('📅 Google Calendar status unavailable:', err.message);
    }
});