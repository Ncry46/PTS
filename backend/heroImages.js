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
    const others = listGalleryBanners({ activeOnly: true });
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

/** ไฟล์แบนเนอร์หน้าแรกที่แอดมินอัปโหลด (รูปนิ่ง / รูปเคลื่อนไหว / วิดีโอ) */
function isGalleryBannerFilename(name) {
    const n = String(name || '');
    if (!/\.(jpe?g|png|webp|gif|mp4|webm)$/i.test(n)) return false;
    if (/^home-banner\./i.test(n)) return true;
    if (/^banner[-_]/i.test(n)) return true;
    return false;
}

function bannerMediaMeta(filename) {
    const ext = String(path.extname(filename || '') || '').toLowerCase();
    if (ext === '.mp4' || ext === '.webm') {
        return { kind: 'video', animated: true, mime: ext === '.webm' ? 'video/webm' : 'video/mp4' };
    }
    if (ext === '.gif') {
        return { kind: 'image', animated: true, mime: 'image/gif' };
    }
    if (ext === '.webp') {
        // may be static or animated — treat as motion-capable
        return { kind: 'image', animated: true, mime: 'image/webp' };
    }
    if (ext === '.png') return { kind: 'image', animated: false, mime: 'image/png' };
    if (ext === '.jpg' || ext === '.jpeg') return { kind: 'image', animated: false, mime: 'image/jpeg' };
    return { kind: 'image', animated: false, mime: 'application/octet-stream' };
}

const BANNER_ORDER_FILE = 'banner-order.json';

function bannerOrderPath() {
    return path.join(HERO_DIR, BANNER_ORDER_FILE);
}

function readBannerMeta() {
    ensureHeroDir();
    const file = bannerOrderPath();
    try {
        if (!fs.existsSync(file)) return { order: [], disabled: [] };
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        const orderList = Array.isArray(raw) ? raw : (Array.isArray(raw?.order) ? raw.order : []);
        const disabledList = Array.isArray(raw?.disabled) ? raw.disabled : [];
        return {
            order: orderList.map((x) => path.basename(String(x || ''))).filter(isGalleryBannerFilename),
            disabled: disabledList.map((x) => path.basename(String(x || ''))).filter(isGalleryBannerFilename)
        };
    } catch (_) {
        return { order: [], disabled: [] };
    }
}

function writeBannerMeta({ order, disabled }) {
    ensureHeroDir();
    const cleanOrder = (Array.isArray(order) ? order : [])
        .map((x) => path.basename(String(x || '')))
        .filter(isGalleryBannerFilename);
    const seen = new Set();
    const uniqueOrder = [];
    for (const name of cleanOrder) {
        if (seen.has(name)) continue;
        seen.add(name);
        uniqueOrder.push(name);
    }
    const orderSet = new Set(uniqueOrder);
    const cleanDisabled = [...new Set(
        (Array.isArray(disabled) ? disabled : [])
            .map((x) => path.basename(String(x || '')))
            .filter((name) => isGalleryBannerFilename(name) && orderSet.has(name))
    )];
    fs.writeFileSync(
        bannerOrderPath(),
        JSON.stringify({ order: uniqueOrder, disabled: cleanDisabled }, null, 2),
        'utf8'
    );
    return { order: uniqueOrder, disabled: cleanDisabled };
}

function readBannerOrder() {
    return readBannerMeta().order;
}

function writeBannerOrder(order) {
    const meta = readBannerMeta();
    return writeBannerMeta({ order, disabled: meta.disabled }).order;
}

function listGalleryBanners(opts = {}) {
    ensureHeroDir();
    const includeDisabled = opts.includeDisabled !== false;
    const activeOnly = opts.activeOnly === true;
    let names = [];
    try {
        names = fs.readdirSync(HERO_DIR).filter(isGalleryBannerFilename);
    } catch (_) {
        names = [];
    }

    const meta = readBannerMeta();
    const disabledSet = new Set(meta.disabled);

    const items = names.map((filename) => {
        const abs = path.join(HERO_DIR, filename);
        let stat;
        try { stat = fs.statSync(abs); } catch (_) { return null; }
        if (!stat.isFile()) return null;
        const ver = Math.floor(stat.mtimeMs);
        const metaKind = bannerMediaMeta(filename);
        const enabled = !disabledSet.has(filename);
        return {
            id: filename,
            filename,
            url: `/uploads/hero/${filename}?v=${ver}`,
            bytes: stat.size,
            updated_at: stat.mtime.toISOString(),
            kind: metaKind.kind,
            animated: metaKind.animated,
            mime: metaKind.mime,
            enabled
        };
    }).filter(Boolean);

    const byName = new Map(items.map((x) => [x.filename, x]));
    const saved = meta.order.filter((name) => byName.has(name));
    const remaining = items
        .filter((x) => !saved.includes(x.filename))
        .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

    let ordered = [
        ...saved.map((name) => byName.get(name)),
        ...remaining
    ].filter(Boolean);

    // keep order file in sync with existing files (preserve disabled)
    if (ordered.length && (saved.length !== ordered.length || saved.some((n, i) => n !== ordered[i].filename))) {
        try {
            writeBannerMeta({
                order: ordered.map((x) => x.filename),
                disabled: meta.disabled.filter((n) => ordered.some((x) => x.filename === n))
            });
        } catch (_) { /* ignore */ }
    }

    if (activeOnly) {
        ordered = ordered.filter((x) => x.enabled);
    } else if (!includeDisabled) {
        ordered = ordered.filter((x) => x.enabled);
    }

    return ordered.map((item, index) => ({ ...item, sort_order: index + 1 }));
}

function setGalleryBannerEnabled(filename, enabled) {
    const safe = path.basename(String(filename || ''));
    if (!isGalleryBannerFilename(safe)) {
        return { ok: false, message: 'ชื่อไฟล์ไม่ถูกต้อง' };
    }
    const abs = path.join(HERO_DIR, safe);
    if (!abs.startsWith(HERO_DIR) || !fs.existsSync(abs)) {
        return { ok: false, message: 'ไม่พบไฟล์' };
    }
    const meta = readBannerMeta();
    const order = meta.order.includes(safe) ? meta.order : [...meta.order, safe];
    let disabled = meta.disabled.filter((n) => n !== safe);
    if (!enabled) disabled.push(safe);
    writeBannerMeta({ order, disabled });
    return { ok: true, data: listGalleryBanners({ includeDisabled: true }) };
}

function reorderGalleryBanners(order) {
    const current = listGalleryBanners({ includeDisabled: true });
    const byName = new Map(current.map((x) => [x.filename, x]));
    const wanted = (Array.isArray(order) ? order : [])
        .map((x) => path.basename(String(x || '')))
        .filter((name) => byName.has(name));
    const rest = current
        .map((x) => x.filename)
        .filter((name) => !wanted.includes(name));
    const meta = readBannerMeta();
    writeBannerMeta({ order: [...wanted, ...rest], disabled: meta.disabled });
    return listGalleryBanners({ includeDisabled: true });
}

function appendBannerToOrder(filename) {
    const safe = path.basename(String(filename || ''));
    if (!isGalleryBannerFilename(safe)) return readBannerOrder();
    const meta = readBannerMeta();
    const order = meta.order.filter((n) => n !== safe);
    order.push(safe);
    // newly uploaded banners start enabled
    const disabled = meta.disabled.filter((n) => n !== safe);
    return writeBannerMeta({ order, disabled }).order;
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
        const meta = readBannerMeta();
        writeBannerMeta({
            order: meta.order.filter((n) => n !== safe),
            disabled: meta.disabled.filter((n) => n !== safe)
        });
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
    const gallery = listGalleryBanners({ activeOnly: true });
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
            FROM dbo.hero_slides
            ORDER BY ISNULL(sort_order, 999) ASC, slide_id ASC
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
                        UPDATE dbo.hero_slides
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
    reorderGalleryBanners,
    appendBannerToOrder,
    deleteGalleryBanner,
    setGalleryBannerEnabled,
    isGalleryBannerFilename,
    bannerMediaMeta,
    listLocalHeroFiles,
    localUploadExists,
    normalizeHeroImageUrl,
    mapHeroSlidesImages,
    repairHeroSlideImages,
    pickFallback,
    isFragileRemoteUrl
};
