const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const HERO_DIR = path.join(UPLOADS_ROOT, 'hero');
const ASSETS_DIR = path.join(__dirname, '..', 'frontend', 'assets');

/** รูปแบนเนอร์หน้าแรก — เก็บไฟล์จริงใน uploads/hero */
const HOME_BANNER_FILENAME = 'home-banner.png';
const HOME_BANNER_ASSET_FALLBACK = 'home-banner.png';

/** รูปใน repo (เสิร์ฟผ่าน express.static frontend) — ไม่พึ่ง CDN นอก */
const BUNDLED_HERO_IMAGES = [
    '/assets/hero-1.png',
    '/assets/hero-2.png',
    '/assets/hero-3.png',
    '/assets/hero-fallback.png',
    '/assets/home-banner.png'
];

function ensureHeroDir() {
    fs.mkdirSync(HERO_DIR, { recursive: true });
    fs.mkdirSync(path.join(UPLOADS_ROOT, 'avatars'), { recursive: true });
}

function homeBannerPath() {
    return path.join(HERO_DIR, HOME_BANNER_FILENAME);
}

/** ถ้ายังไม่มีไฟล์ใน uploads/hero ให้คัดลอกจาก assets */
function ensureHomeBanner() {
    ensureHeroDir();
    const dest = homeBannerPath();
    if (fs.existsSync(dest)) return dest;
    const src = path.join(ASSETS_DIR, HOME_BANNER_ASSET_FALLBACK);
    if (fs.existsSync(src)) {
        try { fs.copyFileSync(src, dest); } catch (_) { /* ignore */ }
    }
    return dest;
}

function publicHomeBannerUrl() {
    ensureHomeBanner();
    const file = homeBannerPath();
    if (fs.existsSync(file)) {
        const ver = Math.floor(fs.statSync(file).mtimeMs);
        return `/uploads/hero/${HOME_BANNER_FILENAME}?v=${ver}`;
    }
    return `/assets/${HOME_BANNER_ASSET_FALLBACK}`;
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
        fallback: `/assets/${HOME_BANNER_ASSET_FALLBACK}`,
        bytes: exists ? fs.statSync(file).size : 0
    };
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

function bundledExists(urlPath) {
    if (!urlPath || !String(urlPath).startsWith('/assets/')) return false;
    const abs = path.join(ASSETS_DIR, path.basename(urlPath));
    try {
        return fs.existsSync(abs) && fs.statSync(abs).isFile();
    } catch (_) {
        return false;
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
    const home = homeBannerPath();
    if (fs.existsSync(home)) return `/uploads/hero/${HOME_BANNER_FILENAME}`;

    const locals = listLocalHeroFiles();
    if (locals.length) {
        const pick = locals[Math.abs(slideIndex) % locals.length];
        return `/uploads/hero/${pick}`;
    }
    const bundled = BUNDLED_HERO_IMAGES.filter(bundledExists);
    if (bundled.length) {
        return bundled[Math.abs(slideIndex) % bundled.length];
    }
    return '/assets/hero-fallback.png';
}

function isFragileRemoteUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u) return true;
    if (u.includes('aida-public') || u.includes('googleusercontent.com/aida')) return true;
    if (u.includes('images.unsplash.com') && listLocalHeroFiles().length) return true;
    return false;
}

function normalizeHeroImageUrl(imageUrl, slideIndex = 0) {
    let raw = String(imageUrl || '').trim();
    if (!raw || isFragileRemoteUrl(raw)) {
        return pickFallback(slideIndex);
    }

    if (/^https?:\/\//i.test(raw)) {
        return raw;
    }

    const winMatch = raw.replace(/\\/g, '/').match(/(?:^|\/)uploads\/(hero|avatars)\/([^/?#]+)$/i);
    if (winMatch) {
        raw = `/uploads/${winMatch[1].toLowerCase()}/${winMatch[2]}`;
    } else if (!raw.startsWith('/') && /\.(jpe?g|png|webp|gif)$/i.test(raw)) {
        raw = `/uploads/hero/${path.basename(raw)}`;
    }

    if (raw.startsWith('/uploads/')) {
        if (localUploadExists(raw)) return raw;
        return pickFallback(slideIndex);
    }

    if (raw.startsWith('/assets/')) {
        if (bundledExists(raw)) return raw;
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
            console.log(`🖼️  ซ่อม URL รูปแบนเนอร์แล้ว ${fixed} รายการ → ใช้ไฟล์ในโปรเจกต์`);
        }
    } catch (err) {
        console.warn('repairHeroSlideImages:', err.message || err);
    }
}

module.exports = {
    HERO_DIR,
    UPLOADS_ROOT,
    HOME_BANNER_FILENAME,
    BUNDLED_HERO_IMAGES,
    ensureHeroDir,
    ensureHomeBanner,
    homeBannerPath,
    publicHomeBannerUrl,
    getHomeBannerInfo,
    listLocalHeroFiles,
    localUploadExists,
    normalizeHeroImageUrl,
    mapHeroSlidesImages,
    repairHeroSlideImages,
    pickFallback,
    isFragileRemoteUrl
};
