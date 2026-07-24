const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const HERO_DIR = path.join(UPLOADS_ROOT, 'hero');

/** รูปแบนเนอร์หน้าแรก — เก็บไฟล์จริงใน uploads/hero */
const HOME_BANNER_FILENAME = 'home-banner.png';

function ensureHeroDir() {
    fs.mkdirSync(HERO_DIR, { recursive: true });
    fs.mkdirSync(path.join(UPLOADS_ROOT, 'avatars'), { recursive: true });
}

function homeBannerPath() {
    return path.join(HERO_DIR, HOME_BANNER_FILENAME);
}

function ensureHomeBanner() {
    ensureHeroDir();
    return homeBannerPath();
}

function publicHomeBannerUrl() {
    ensureHomeBanner();
    const file = homeBannerPath();
    if (fs.existsSync(file)) {
        const ver = Math.floor(fs.statSync(file).mtimeMs);
        return `/uploads/hero/${HOME_BANNER_FILENAME}?v=${ver}`;
    }
    // fallback: รูปแบนเนอร์อื่นในโฟลเดอร์
    const others = listGalleryBanners();
    if (others.length) return others[0].url;
    return `/uploads/hero/${HOME_BANNER_FILENAME}`;
}

function getHomeBannerInfo() {
    ensureHomeBanner();
    const file = homeBannerPath();
    const exists = fs.existsSync(file);
    return {
        filename: HOME_BANNER_FILENAME,
        path: file,
        uploaded: exists,
        url: publicHomeBannerUrl(),
        fallback: `/uploads/hero/${HOME_BANNER_FILENAME}`,
        bytes: exists ? fs.statSync(file).size : 0
    };
}

/** ไฟล์แบนเนอร์หน้าแรกที่แอดมินอัปโหลด (ไม่รวมรูป hero แนวตั้งเก่า) */
function isGalleryBannerFilename(name) {
    const n = String(name || '');
    if (!/\.(jpe?g|png|webp|gif)$/i.test(n)) return false;
    if (/^home-banner\./i.test(n)) return true;
    if (/^banner[-_]/i.test(n)) return true;
    return false;
}

function listGalleryBanners() {
    ensureHeroDir();
    let names = [];
    try {
        names = fs.readdirSync(HERO_DIR).filter(isGalleryBannerFilename);
    } catch (_) {
        names = [];
    }

    const items = names.map((filename) => {
        const abs = path.join(HERO_DIR, filename);
        let stat;
        try { stat = fs.statSync(abs); } catch (_) { return null; }
        if (!stat.isFile()) return null;
        const ver = Math.floor(stat.mtimeMs);
        return {
            id: filename,
            filename,
            url: `/uploads/hero/${filename}?v=${ver}`,
            bytes: stat.size,
            updated_at: stat.mtime.toISOString()
        };
    }).filter(Boolean);

    items.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    return items;
}

function deleteGalleryBanner(filename) {
    const safe = path.basename(String(filename || ''));
    if (!isGalleryBannerFilename(safe)) {
        return { ok: false, message: 'ชื่อไฟล์ไม่ถูกต้อง' };
    }
    const abs = path.join(HERO_DIR, safe);
    if (!abs.startsWith(HERO_DIR)) {
        return { ok: false, message: 'พาธไม่ถูกต้อง' };
    }
    if (!fs.existsSync(abs)) {
        return { ok: false, message: 'ไม่พบไฟล์' };
    }
    try {
        fs.unlinkSync(abs);
        return { ok: true };
    } catch (err) {
        return { ok: false, message: err.message || 'ลบไม่สำเร็จ' };
    }
}

function listLocalHeroFiles() {
    ensureHeroDir();
    try {
        return fs.readdirSync(HERO_DIR)
            .filter((name) => /\.(jpe?g|png|webp|gif)$/i.test(name))
            .sort();
    } catch (_) {
        return [];
    }
}

function localUploadExists(urlPath) {
    if (!urlPath || !String(urlPath).startsWith('/uploads/')) return false;
    const rel = String(urlPath).replace(/^\/uploads\//, '').replace(/\//g, path.sep);
    const abs = path.join(UPLOADS_ROOT, rel);
    if (!abs.startsWith(UPLOADS_ROOT)) return false;
    try {
        return fs.existsSync(abs) && fs.statSync(abs).isFile();
    } catch (_) {
        return false;
    }
}

function pickFallback(slideIndex = 0) {
    const gallery = listGalleryBanners();
    if (gallery.length) {
        return gallery[Math.abs(slideIndex) % gallery.length].url.split('?')[0];
    }
    const home = homeBannerPath();
    if (fs.existsSync(home)) return `/uploads/hero/${HOME_BANNER_FILENAME}`;

    const locals = listLocalHeroFiles();
    if (locals.length) {
        const pick = locals[Math.abs(slideIndex) % locals.length];
        return `/uploads/hero/${pick}`;
    }
    return `/uploads/hero/${HOME_BANNER_FILENAME}`;
}

function isFragileRemoteUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u) return true;
    if (u.includes('aida-public') || u.includes('googleusercontent.com/aida')) return true;
    if (u.includes('images.unsplash.com') && listLocalHeroFiles().length) return true;
    return false;
}

/** map พาธเก่า /assets/... → /uploads/... */
function remapLegacyAssetUrl(raw) {
    const name = path.basename(String(raw || '').split('?')[0]);
    if (!name) return null;
    if (/^(logo|stamp)\.png$/i.test(name)) return `/uploads/cert/${name}`;
    if (/\.(jpe?g|png|webp|gif)$/i.test(name)) return `/uploads/hero/${name}`;
    return null;
}

function normalizeHeroImageUrl(imageUrl, slideIndex = 0) {
    let raw = String(imageUrl || '').trim();
    if (!raw || isFragileRemoteUrl(raw)) {
        return pickFallback(slideIndex);
    }

    if (/^https?:\/\//i.test(raw)) {
        return raw;
    }

    if (raw.startsWith('/assets/')) {
        const mapped = remapLegacyAssetUrl(raw);
        if (mapped && localUploadExists(mapped)) return mapped;
        return pickFallback(slideIndex);
    }

    const winMatch = raw.replace(/\\/g, '/').match(/(?:^|\/)uploads\/(hero|avatars|cert)\/([^/?#]+)$/i);
    if (winMatch) {
        raw = `/uploads/${winMatch[1].toLowerCase()}/${winMatch[2]}`;
    } else if (!raw.startsWith('/') && /\.(jpe?g|png|webp|gif)$/i.test(raw)) {
        raw = `/uploads/hero/${path.basename(raw)}`;
    }

    if (raw.startsWith('/uploads/')) {
        if (localUploadExists(raw)) return raw;
        return pickFallback(slideIndex);
    }

    return pickFallback(slideIndex);
}

function mapHeroSlidesImages(rows) {
    return (rows || []).map((row, index) => {
        const original = String(row.image_url || '').trim();
        const resolved = normalizeHeroImageUrl(original, index);
        const missing = !original
            || isFragileRemoteUrl(original)
            || (original.startsWith('/uploads/') && !localUploadExists(original));
        return {
            ...row,
            image_url: resolved,
            image_missing: missing && resolved !== original
        };
    });
}

async function repairHeroSlideImages(pool) {
    const sql = require('mssql');
    try {
        const result = await pool.request().query(`
            SELECT slide_id, image_url, sort_order
            FROM BD_PTS.dbo.hero_slides
            ORDER BY sort_order ASC, slide_id ASC
        `);
        const rows = result.recordset || [];
        let fixed = 0;
        for (let i = 0; i < rows.length; i += 1) {
            const row = rows[i];
            const original = String(row.image_url || '').trim();
            const resolved = normalizeHeroImageUrl(original, i);
            if (resolved && resolved !== original) {
                await pool.request()
                    .input('slideId', sql.Int, row.slide_id)
                    .input('imageUrl', sql.NVarChar, resolved)
                    .query(`
                        UPDATE BD_PTS.dbo.hero_slides
                        SET image_url = @imageUrl, updated_at = GETDATE()
                        WHERE slide_id = @slideId
                    `);
                fixed += 1;
            }
        }
        if (fixed) {
            console.log(`🖼️  ซ่อม URL รูปแบนเนอร์แล้ว ${fixed} รายการ → ใช้ไฟล์ใน uploads/`);
        }
    } catch (err) {
        console.warn('repairHeroSlideImages:', err.message || err);
    }
}

module.exports = {
    HERO_DIR,
    UPLOADS_ROOT,
    HOME_BANNER_FILENAME,
    ensureHeroDir,
    ensureHomeBanner,
    homeBannerPath,
    publicHomeBannerUrl,
    getHomeBannerInfo,
    listGalleryBanners,
    deleteGalleryBanner,
    isGalleryBannerFilename,
    listLocalHeroFiles,
    localUploadExists,
    normalizeHeroImageUrl,
    mapHeroSlidesImages,
    repairHeroSlideImages,
    pickFallback,
    isFragileRemoteUrl
};
