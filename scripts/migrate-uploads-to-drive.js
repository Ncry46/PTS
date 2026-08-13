/**
 * One-off: backup existing local uploads to Google Drive category folders.
 * Does not rewrite DB URLs — local files remain the display source.
 *
 * Usage: node scripts/migrate-uploads-to-drive.js
 */
const path = require('path');
const fs = require('fs');
const { tryUploadLocalFile, isDriveConfigured, DRIVE_CATEGORIES } = require('../backend/googleDrive');

const ROOT = path.join(__dirname, '..', 'uploads');
const CATEGORIES = Object.keys(DRIVE_CATEGORIES);

function listFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((name) => /\.(jpe?g|png|webp|gif|mp4|webm)$/i.test(name))
      .map((name) => path.join(dir, name));
  } catch (_) {
    return [];
  }
}

function guessMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  return 'image/jpeg';
}

(async () => {
  if (!isDriveConfigured()) {
    console.error('Drive ยังไม่พร้อม — ตั้ง GOOGLE_DRIVE_FOLDER_ID + OAuth ก่อน');
    process.exit(1);
  }
  let ok = 0;
  let fail = 0;
  for (const category of CATEGORIES) {
    const dir = path.join(ROOT, category);
    const files = listFiles(dir);
    console.log(`\n[${category}] ${files.length} files`);
    for (const filePath of files) {
      const filename = path.basename(filePath);
      const result = await tryUploadLocalFile(filePath, {
        filename,
        mimeType: guessMime(filePath),
        category
      });
      if (result && result.ok) {
        ok += 1;
        console.log('  ✓', filename, '→', result.fileId);
      } else {
        fail += 1;
        console.warn('  ✗', filename, result?.error || 'failed');
      }
    }
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
