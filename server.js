const express = require('express');
const sql = require('mssql');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 🔗 1. ตั้งค่าการเชื่อมต่อ Microsoft SQL Server
const dbConfig = {
    user: 'uinet',                       
    password: 'p@$$w0rd',
    server: 'tvsdb2.thanvasupos.com',    
    port: 28914,                         
    database: 'BD_PTS',                  
    options: { encrypt: true, trustServerCertificate: true },
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

// -------------------------------------------------------------------------
// [จุดที่ 1] API สำหรับหน้าเว็บจริงของคุณ: บันทึกข้อมูลสมัครสมาชิก/ลงทะเบียนพนักงาน
// -------------------------------------------------------------------------
app.post('/api/users/register', async (req, res) => {
    const { full_name, email, phone, password } = req.body;

    if (!full_name || !email || !password) {
        return res.status(400).json({ success: false, message: 'กรุณากรอกข้อมูลหลักให้ครบถ้วน' });
    }

    try {
        const pool = await poolPromise;
        
        // คำสั่ง SQL เพิ่มข้อมูลพนักงานโดยใช้ email เป็นคีย์ระบุตัวตน
        const insertUserQuery = `
            INSERT INTO BD_PTS.dbo.users_main (email, full_name, phone, password_hash)
            VALUES (@email, @fullName, @phone, @pass)
        `;
        
        await pool.request()
            .input('email', sql.VarChar, email)
            .input('fullName', sql.NVarChar, full_name)
            .input('phone', sql.VarChar, phone || '-')
            .input('pass', sql.VarChar, password) 
            .query(insertUserQuery);

        res.json({ success: true, message: 'ลงทะเบียนสมาชิกสำเร็จแล้ว!' });
    } catch (error) {
        console.error(error);
        if (error.message.includes('UNIQUE')) {
            res.status(400).json({ success: false, message: 'อีเมลนี้เคยลงทะเบียนในระบบไว้แล้ว' });
        } else {
            res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในการลงทะเบียน' });
        }
    }
});

// -------------------------------------------------------------------------
// [จุดที่ 2] API สำหรับหน้าตู้ Kiosk: เปลี่ยนมารับค่า QR Code ที่เป็น "อีเมล" 
// -------------------------------------------------------------------------
app.post('/api/attendance/scan', async (req, res) => {
    const { employee_id, kiosk_device_id } = req.body; // employee_id ในที่นี้คือ "อีเมล" ที่ได้จากการสแกน QR

    if (!employee_id || !kiosk_device_id) {
        return res.status(400).json({ success: false, message: 'ข้อมูลไม่ครบถ้วน' });
    }

    try {
        const pool = await poolPromise;
        const now = new Date();
        const tzoffset = now.getTimezoneOffset() * 60000; 
        const localISOTime = new Date(now.getTime() - tzoffset).toISOString().slice(0, 19).replace('T', ' ');
        const currentDateOnly = localISOTime.split(' ')[0];

        // ค้นหาพนักงานจากอีเมล
        const userQuery = `SELECT full_name FROM BD_PTS.dbo.users_main WHERE email = @email`;
        const userResult = await pool.request().input('email', sql.VarChar, employee_id).query(userQuery);

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ success: false, message: 'ไม่พบข้อมูลสมาชิกคนนี้ในระบบ' });
        }

        const empInfo = userResult.recordset[0];

        // ตรวจสอบสถานะสลับสิทธิ์ IN/OUT ของวันปัจจุบัน
        const checkQuery = `
            SELECT TOP 1 scan_type FROM BD_PTS.dbo.attendance_logs 
            WHERE employee_id = @email AND CAST(scan_timestamp AS DATE) = CAST(@localDate AS DATE)
            ORDER BY log_id DESC
        `;
        const checkResult = await pool.request()
            .input('email', sql.VarChar, employee_id)
            .input('localDate', sql.VarChar, currentDateOnly)
            .query(checkQuery);

        let scan_type = 'IN';
        if (checkResult.recordset.length > 0 && checkResult.recordset[0].scan_type === 'IN') {
            scan_type = 'OUT';
        }

        let status = 'NORMAL';
        if (scan_type === 'IN' && now > new Date(now.getFullYear(), now.getMonth(), now.getDate(), 8, 30, 0)) {
            status = 'LATE';
        }

        // บันทึกลงตารางประวัติ
        const insertQuery = `
            INSERT INTO BD_PTS.dbo.attendance_logs (employee_id, scan_timestamp, scan_type, kiosk_device_id, status)
            VALUES (@email, @scanTime, @scanType, @kioskId, @status)
        `;
        await pool.request()
            .input('email', sql.VarChar, employee_id)
            .input('scanTime', sql.DateTime, localISOTime)
            .input('scanType', sql.VarChar, scan_type)
            .input('kioskId', sql.VarChar, kiosk_device_id)
            .input('status', sql.VarChar, status)
            .query(insertQuery);

        res.json({
            success: true,
            message: 'บันทึกเวลาสำเร็จ',
            data: {
                employee_name: empInfo.full_name,
                scan_time: now.toLocaleTimeString('th-TH'),
                scan_type: scan_type === 'IN' ? 'เข้างาน' : 'ออกงาน',
                status: status === 'LATE' ? 'มาสาย' : 'ปกติ'
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'เกิดข้อผิดพลาดในระบบฐานข้อมูลหลังบ้าน' });
    }
});

// -------------------------------------------------------------------------
// [จุดที่ 3] API สำหรับหน้าเว็บรายงาน: ดึงประวัติมาโชว์ที่หน้าเว็บหลักของคุณ
// -------------------------------------------------------------------------
app.get('/api/attendance/report', async (req, res) => {
    try {
        const pool = await poolPromise;
        const reportQuery = `
            SELECT a.log_id, u.email, u.full_name, u.phone, a.scan_timestamp, a.scan_type, a.status
            FROM BD_PTS.dbo.attendance_logs a
            LEFT JOIN BD_PTS.dbo.users_main u ON a.employee_id = u.email
            ORDER BY a.log_id DESC
        `;
        const result = await pool.request().query(reportQuery);
        res.json({ success: true, data: result.recordset });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: 'ไม่สามารถดึงข้อมูลรายงานได้' });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
// ➕ เพิ่มตรงนี้: บังคับให้ Node.js ส่งหน้าตู้สแกน Kiosk ออกมาเมื่อเรียกผ่านพอร์ต 3000
app.get('/kiosk', (req, res) => {
    res.sendFile(__dirname + '/kiosk.html');
});

// ➕ เพิ่มตรงนี้ (แถมให้): ถ้าอยากเปิดดูหน้าเว็บรายงานผ่าน localhost:3000/report ด้วย
app.get('/report', (req, res) => {
    res.sendFile(__dirname + '/report.html');
});