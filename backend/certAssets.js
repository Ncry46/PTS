const fs = require('fs');
const path = require('path');

const CERT_DIR = path.join(__dirname, '..', 'uploads', 'cert');
const ASSETS_DIR = path.join(__dirname, '..', 'frontend', 'assets');

const CERT_SLOTS = {
    logo: { filename: '2.png', assetFallback: '2.png', label: 'โลโก้' },
    stamp: { filename: '2_2.png', assetFallback: '2_2.png', label: 'สแตมป์' }
};

function ensureCertDir() {
    fs.mkdirSync(CERT_DIR, { recursive: true });
    // Seed from frontend/assets when upload folder is empty
    for (const slot of Object.values(CERT_SLOTS)) {
        const dest = path.join(CERT_DIR, slot.filename);
        if (fs.existsSync(dest)) continue;
        const src = path.join(ASSETS_DIR, slot.assetFallback);
        if (fs.existsSync(src)) {
            try { fs.copyFileSync(src, dest); } catch (_) { /* ignore */ }
        }
    }
    return CERT_DIR;
}

function certFilePath(slotKey) {
    const slot = CERT_SLOTS[slotKey];
    if (!slot) return null;
    return path.join(CERT_DIR, slot.filename);
}

function publicUrl(slotKey) {
    const slot = CERT_SLOTS[slotKey];
    if (!slot) return null;
    const file = path.join(CERT_DIR, slot.filename);
    if (fs.existsSync(file)) {
        const ver = Math.floor(fs.statSync(file).mtimeMs);
        return `/uploads/cert/${slot.filename}?v=${ver}`;
    }
    return `/assets/${slot.assetFallback}`;
}

function listCertAssets() {
    ensureCertDir();
    return Object.entries(CERT_SLOTS).map(([key, slot]) => {
        const file = path.join(CERT_DIR, slot.filename);
        const exists = fs.existsSync(file);
        return {
            slot: key,
            label: slot.label,
            filename: slot.filename,
            url: publicUrl(key),
            uploaded: exists,
            fallback: `/assets/${slot.assetFallback}`
        };
    });
}

module.exports = {
    CERT_DIR,
    CERT_SLOTS,
    ensureCertDir,
    certFilePath,
    publicUrl,
    listCertAssets
};
