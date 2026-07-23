/**
 * เข้าสู่ระบบด้วย Gmail (Google OAuth)
 * ใช้ Client ID/Secret เดียวกับ Google Calendar
 * Redirect URI เดิม: /api/google/oauth/callback (แยกจาก Calendar ด้วย session purpose)
 */
const express = require('express');
const crypto = require('crypto');
const sql = require('mssql');
const {
    isGoogleConfigured,
    publicGoogleStatus,
    buildLoginAuthUrl,
    exchangeCode,
    fetchGoogleProfile,
    newOAuthState
} = require('./googleCalendar');
const { createNotification } = require('./ensureSchema');

function createGoogleAuthRouter({ poolPromise }) {
    const router = express.Router();

    router.get('/auth/google/status', (_req, res) => {
        res.json({ success: true, ...publicGoogleStatus() });
    });

    router.get('/auth/google/start', (req, res) => {
        if (!isGoogleConfigured()) {
            const wantJson = req.query.redirect === '0'
                || (req.headers.accept && String(req.headers.accept).includes('application/json'));
            const payload = {
                success: false,
                message: 'ยังไม่ได้ตั้งค่า Google OAuth — ใส่ GOOGLE_CLIENT_ID / SECRET ใน .env หรือ backend/google.local.js',
                ...publicGoogleStatus()
            };
            if (wantJson) return res.status(503).json(payload);
            return res.redirect(`/Login.html?google=error&msg=${encodeURIComponent(payload.message)}`);
        }

        const state = newOAuthState();
        req.session.googleOAuthState = state;
        req.session.googleOAuthPurpose = 'login';
        delete req.session.googleOAuthUserId;

        const next = String(req.query.next || '').trim();
        if (next && /^[A-Za-z0-9._\-/?#%=]+$/.test(next) && !next.includes('://')) {
            req.session.googleLoginNext = next;
        } else {
            delete req.session.googleLoginNext;
        }

        try {
            const url = buildLoginAuthUrl(state);
            const finish = () => {
                if (req.query.redirect === '0') return res.json({ success: true, url });
                return res.redirect(url);
            };
            if (typeof req.session.save === 'function') {
                return req.session.save((err) => {
                    if (err) {
                        console.error('[google-auth] session.save:', err.message);
                        return res.status(500).json({ success: false, message: 'บันทึก session ไม่สำเร็จ' });
                    }
                    return finish();
                });
            }
            return finish();
        } catch (error) {
            return res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}

async function completeGoogleLogin(req, res, { poolPromise, code }) {
    const loginUrl = '/Login.html?google=';
    try {
        const tokens = await exchangeCode(code);
        const profile = await fetchGoogleProfile(tokens.access_token);
        if (!profile || !profile.email) {
            return res.redirect(`${loginUrl}error&msg=${encodeURIComponent('ไม่ได้รับอีเมลจาก Google')}`);
        }

        const email = String(profile.email).trim().toLowerCase();
        const fullName = String(profile.name || email.split('@')[0] || 'ผู้ใช้ Google').trim();
        const picture = profile.picture || null;

        const pool = await poolPromise;
        let userRow = null;

        const existing = await pool.request()
            .input('email', sql.VarChar, email)
            .query(`
                SELECT user_id, email, full_name, Role, FlagUse, Url
                FROM BD_PTS.dbo.users_main
                WHERE LOWER(email) = @email
            `);

        if (existing.recordset.length) {
            userRow = existing.recordset[0];
            if (userRow.FlagUse === 'N') {
                return res.redirect(`${loginUrl}error&msg=${encodeURIComponent('บัญชีนี้ถูกระงับการใช้งานชั่วคราว')}`);
            }
            // อัปเดตรูปโปรไฟล์จาก Google ถ้ายังไม่มี
            if (picture && !userRow.Url) {
                try {
                    await pool.request()
                        .input('userId', sql.Int, userRow.user_id)
                        .input('url', sql.NVarChar, picture)
                        .query(`UPDATE BD_PTS.dbo.users_main SET Url = @url WHERE user_id = @userId`);
                    userRow.Url = picture;
                } catch (_) { /* ignore */ }
            }
        } else {
            const randomPass = crypto.randomBytes(24).toString('hex');
            await pool.request()
                .input('email', sql.VarChar, email)
                .input('fullName', sql.NVarChar, fullName)
                .input('phone', sql.VarChar, '-')
                .input('pass', sql.VarChar, randomPass)
                .input('url', sql.NVarChar, picture)
                .query(`
                    INSERT INTO BD_PTS.dbo.users_main (email, full_name, phone, password_hash, Role, FlagUse, Url)
                    VALUES (@email, @fullName, @phone, @pass, 'student', 'Y', @url)
                `);

            const created = await pool.request()
                .input('email', sql.VarChar, email)
                .query(`
                    SELECT user_id, email, full_name, Role, FlagUse, Url
                    FROM BD_PTS.dbo.users_main
                    WHERE LOWER(email) = @email
                `);
            userRow = created.recordset[0];
            if (userRow) {
                try {
                    await createNotification(
                        pool,
                        userRow.user_id,
                        'ยินดีต้อนรับสู่ PTS Learning',
                        'เข้าสู่ระบบด้วย Gmail สำเร็จแล้ว เริ่มเลือกหลักสูตรได้เลย',
                        'Courses.html'
                    );
                } catch (_) { /* ignore */ }
            }
        }

        if (!userRow) {
            return res.redirect(`${loginUrl}error&msg=${encodeURIComponent('สร้างหรือหาบัญชีไม่สำเร็จ')}`);
        }

        req.session.user = {
            user_id: userRow.user_id,
            name: userRow.full_name,
            email: userRow.email,
            Url: userRow.Url || picture || null,
            role: userRow.Role ? String(userRow.Role).toLowerCase() : 'student'
        };

        delete req.session.googleOAuthState;
        delete req.session.googleOAuthPurpose;
        delete req.session.googleOAuthUserId;

        const role = req.session.user.role;
        let next = (req.session.googleLoginNext || '').trim();
        delete req.session.googleLoginNext;
        if (!next) {
            next = role === 'admin' ? 'Admin.html' : 'DashbordU.html';
        }

        const finish = () => res.redirect(`/${next.replace(/^\//, '')}`);
        if (typeof req.session.save === 'function') {
            return req.session.save((err) => {
                if (err) console.error('[google-auth] session.save after login:', err.message);
                return finish();
            });
        }
        return finish();
    } catch (error) {
        console.error('[google-auth] login failed:', error.message);
        return res.redirect(`${loginUrl}error&msg=${encodeURIComponent(error.message || 'เข้าสู่ระบบด้วย Gmail ไม่สำเร็จ')}`);
    }
}

module.exports = { createGoogleAuthRouter, completeGoogleLogin };
