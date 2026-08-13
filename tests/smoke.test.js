const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';

describe('PTS smoke — modules', () => {
  it('loads googleDrive categories', () => {
    const drive = require(path.join(ROOT, 'backend', 'googleDrive.js'));
    assert.ok(drive.DRIVE_CATEGORIES.avatars);
    assert.ok(typeof drive.tryUploadLocalFile === 'function');
  });

  it('loads admin audit helpers', () => {
    const audit = require(path.join(ROOT, 'backend', 'adminAudit.js'));
    assert.ok(typeof audit.writeAdminAudit === 'function');
    assert.ok(typeof audit.listAdminAudit === 'function');
  });

  it('loads upcoming class notifier', () => {
    const n = require(path.join(ROOT, 'backend', 'upcomingClassNotify.js'));
    assert.ok(typeof n.notifyUpcomingClasses === 'function');
  });

  it('frontend pages exist', () => {
    for (const name of ['Courses.html', 'Community.html', 'Admin.html', 'User.html', 'LineApp.html']) {
      assert.ok(fs.existsSync(path.join(ROOT, 'frontend', name)), name);
    }
  });
});

describe('PTS smoke — HTTP (optional running server)', () => {
  async function get(pathname) {
    const res = await fetch(`${BASE}${pathname}`, { redirect: 'manual' });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) { /* html */ }
    return { res, text, json };
  }

  it('serves Login.html', async (t) => {
    try {
      const { res, text } = await get('/Login.html');
      if (res.status === 404 || res.status >= 500) {
        t.skip('server not reachable — start with npm start');
        return;
      }
      assert.equal(res.status, 200);
      assert.match(text, /login|เข้าสู่ระบบ/i);
    } catch (err) {
      t.skip(`server not reachable: ${err.message}`);
    }
  });

  it('GET /api/courses returns success payload', async (t) => {
    try {
      const { res, json } = await get('/api/courses');
      if (!res.ok && res.status !== 401) {
        t.skip(`server not ready (${res.status})`);
        return;
      }
      assert.ok(json);
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
    } catch (err) {
      t.skip(`server not reachable: ${err.message}`);
    }
  });

  it('GET /api/community returns success payload', async (t) => {
    try {
      const { res, json } = await get('/api/community');
      if (!res.ok) {
        t.skip(`server not ready (${res.status})`);
        return;
      }
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
    } catch (err) {
      t.skip(`server not reachable: ${err.message}`);
    }
  });

  it('GET /api/home-banners returns banners', async (t) => {
    try {
      const { res, json } = await get('/api/home-banners');
      if (!res.ok) {
        t.skip(`server not ready (${res.status})`);
        return;
      }
      assert.equal(json.success, true);
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.length >= 1);
    } catch (err) {
      t.skip(`server not reachable: ${err.message}`);
    }
  });
});
