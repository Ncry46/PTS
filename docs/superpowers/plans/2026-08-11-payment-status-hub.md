# Payment Status Hub + Login Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Payments.html` the learner payment status hub (nav + clear CTAs) and return users to the same course after login from CourseDetail.

**Architecture:** Frontend-only changes on existing pages/components. Reuse `GET /api/my/payments` (already returns `course_id`). Reuse existing `Login.html?next=` + Google `googleLoginNext`. No schema changes. No auto-open pay modal.

**Tech Stack:** Static HTML/JS frontend, Express session login, existing i18n keys in `components/i18n-dict.js`.

**Spec:** `docs/superpowers/specs/2026-08-11-payment-status-hub-design.md`

## Global Constraints

- Reuse `frontend/Payments.html` — do not create a new status page.
- After login: land on `CourseDetail.html?courseId={id}` only — do not auto-open pay modal.
- CTAs: `pending_review` → CourseDetail; `paid` → `Learn.html?courseId=…`.
- Query param on CourseDetail is **`courseId`** (not `id`) — match existing `CourseDetail.html` / `Learn.html`.
- Thai-first UI; reuse `nav.payments` / `side.payments` i18n keys.
- Do not implement Spec C/D/B in this plan.
- No automated test suite in this repo for these pages — verify with manual checks listed per task.

## File map

| File | Responsibility |
|------|----------------|
| `components/user-sidebar.js` | Learner sidebar link to Payments |
| `components/navbar.js` | Account dropdown link to Payments |
| `components/i18n-dict.js` | Optional label tweak to การชำระเงิน |
| `frontend/Payments.html` | Status CTAs for pending_review / paid |
| `frontend/CourseDetail.html` | Login links with `?next=` back to this course |
| `backend/learningRoutes.js` | Touch only if `course_id` missing (should skip) |

---

### Task 1: Add Payments to learner navigation

**Files:**
- Modify: `components/user-sidebar.js`
- Modify: `components/navbar.js`
- Modify: `components/i18n-dict.js` (label only)

**Interfaces:**
- Consumes: existing i18n keys `side.payments`, `nav.payments`
- Produces: clickable `Payments.html` entry in sidebar (after MyCourses) and student account dropdown

- [ ] **Step 1: Update Thai i18n labels to match spec**

In `components/i18n-dict.js`, set:

```js
'nav.payments': { th: 'การชำระเงิน', en: 'Payments' },
'side.payments': { th: 'การชำระเงิน', en: 'Payments' },
```

(Keep admin key `nav.admin.payments` as-is.)

- [ ] **Step 2: Insert sidebar item after MyCourses**

In `components/user-sidebar.js`, in the links array, after the MyCourses entry add:

```js
{ href: 'Payments.html', labelKey: 'side.payments', label: 'การชำระเงิน', match: /Payments\.html/i },
```

- [ ] **Step 3: Insert account-dropdown link for students**

In `components/navbar.js` → `profileMenuHtml` → `studentLinks`, after the dashboard link (or after a courses-related link if present; otherwise after dashboard), add:

```html
<a href="Payments.html" role="menuitem" data-i18n="nav.payments">${t('nav.payments', 'การชำระเงิน')}</a>
```

Do **not** add Payments to guest top nav. Do **not** change adminLinks (Admin already has `#payments`).

- [ ] **Step 4: Manual verify nav**

Run: start app if needed (`npm start`), log in as learner, confirm:
1. Sidebar shows การชำระเงิน after หลักสูตรของฉัน and opens Payments.html
2. Account dropdown shows the same link
3. Guest navbar has no Payments link

- [ ] **Step 5: Commit**

```bash
git add components/user-sidebar.js components/navbar.js components/i18n-dict.js
git commit -m "feat(nav): add learner Payments link to sidebar and account menu"
```

---

### Task 2: Payment history CTAs for pending_review and paid

**Files:**
- Modify: `frontend/Payments.html` (`loadPayments` rendering)

**Interfaces:**
- Consumes: `GET /api/my/payments` rows with `status`, `course_id`, `method`, `reject_reason`
- Produces: buttons — ดูรายละเอียดคอร์ส / เข้าเรียนต่อ (plus existing slip/card actions)

- [ ] **Step 1: Confirm API already returns course_id**

Open `backend/learningRoutes.js` route `GET /my/payments` — SELECT already includes `c.course_id`. **Do not change backend** unless a live response is missing it.

- [ ] **Step 2: Extend action button logic in `loadPayments`**

Replace the current `action` ternary in `frontend/Payments.html` so it covers all four statuses. Keep existing pending/rejected behavior; add:

```js
let action = '';
const cid = Number(p.course_id) || 0;
if (p.status === 'pending' && p.method !== 'card' && p.method !== 'access_code') {
  action = `<button data-id="${p.payment_id}" class="resume-slip pts-btn pts-btn-primary">แนบสลิป</button>`;
} else if (p.status === 'pending' && p.method === 'card') {
  action = `<button data-id="${p.payment_id}" data-amount="${p.amount}" class="resume-card pts-btn pts-btn-outline">ชำระด้วยบัตร</button>`;
} else if (p.status === 'pending_review' && cid) {
  action = `<a class="pts-btn pts-btn-outline" href="CourseDetail.html?courseId=${cid}">ดูรายละเอียดคอร์ส</a>`;
} else if (p.status === 'rejected') {
  action = `<button data-id="${p.payment_id}" class="resume-slip pts-btn pts-btn-outline">ส่งสลิปใหม่</button>`;
} else if (p.status === 'paid' && cid) {
  action = `<a class="pts-btn pts-btn-primary" href="Learn.html?courseId=${cid}">เข้าเรียนต่อ</a>`;
}
```

Keep status badges and reject_reason display unchanged.

- [ ] **Step 3: Manual verify CTAs**

With real or existing payment rows:
1. `pending` → แนบสลิป / ชำระด้วยบัตร still works
2. `pending_review` → ดูรายละเอียดคอร์ส opens correct CourseDetail
3. `paid` → เข้าเรียนต่อ opens Learn for that course
4. `rejected` → ส่งสลิปใหม่ still works; reason still visible

- [ ] **Step 4: Commit**

```bash
git add frontend/Payments.html
git commit -m "feat(payments): add course and learn CTAs by payment status"
```

---

### Task 3: CourseDetail login return via `?next=`

**Files:**
- Modify: `frontend/CourseDetail.html`

**Interfaces:**
- Consumes: page `courseId` from `URLSearchParams` (already defined)
- Produces: `Login.html?next=` + encoded `CourseDetail.html?courseId={courseId}`
- Relies on existing `frontend/login.js` safe-next redirect and Google `googleLoginNext`

- [ ] **Step 1: Add a small helper near top of CourseDetail script**

After `const courseId = …` add:

```js
const loginNextHref = () => {
  if (!courseId) return 'Login.html';
  const next = `CourseDetail.html?courseId=${encodeURIComponent(courseId)}`;
  return `Login.html?next=${encodeURIComponent(next)}`;
};
```

Note: outer `encodeURIComponent` wraps the full relative next path so `login.js` receives one `next` query value. Inner encode on the id is safe for numeric ids.

- [ ] **Step 2: Wire enroll CTA when logged out**

Change the enroll-login anchor from `href="Login.html"` to:

```js
? `<a class="pts-btn pts-btn-primary" href="${loginNextHref()}" data-cta="enroll-login">${escapeHtml(tt('courses.enrollLogin', 'เข้าสู่ระบบเพื่อสมัครเรียน'))}</a>`
```

- [ ] **Step 3: Wire review-gate login link**

Where review form shows logged-out gate (`href="Login.html"`), use `loginNextHref()` instead.

- [ ] **Step 4: Wire guest fallback navbar Login links (optional but in-spec)**

Static guest Login anchors in the page (around the `#app-navbar` placeholder and the PTS-NAV-INLINE-BOOT fallback) should include next when `courseId` is present. Prefer a tiny post-boot script that rewrites:

```js
document.querySelectorAll('#app-navbar a[href="Login.html"], #app-navbar a[href^="Login.html?"]').forEach((a) => {
  if (courseId) a.setAttribute('href', loginNextHref());
});
```

Run this after navbar mount if practical; if navbar.js replaces HTML later, call the rewrite after `navbar.js` loads (end of body) so the final Login links keep `next`.

- [ ] **Step 5: Manual verify return URL**

1. Log out → open `CourseDetail.html?courseId=<known>` → click เข้าสู่ระบบเพื่อสมัครเรียน
2. Address bar shows `Login.html?next=CourseDetail.html%3FcourseId%3D…`
3. Password login → lands on same CourseDetail (same courseId)
4. Pay modal does **not** open automatically
5. If Google login available: same `?next=` returns to course after OAuth

- [ ] **Step 6: Commit**

```bash
git add frontend/CourseDetail.html
git commit -m "feat(auth): return to course detail after login from enroll CTA"
```

---

### Task 4: End-to-end smoke (no code)

- [ ] **Step 1: Run full acceptance from spec**

1. Logged-in learner: sidebar + dropdown → Payments.html
2. PromptPay path: pending → pending_review CTA → admin approve → paid → Learn
3. Reject path: rejected → resubmit slip + reason
4. Logged-out CourseDetail enroll-login → login → same course, no auto modal

- [ ] **Step 2: If anything fails, fix in the owning task file and amend only if commit not pushed and was created by this agent in this session; otherwise new commit**

- [ ] **Step 3: Final commit only if leftover fixes remain; otherwise done**

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Sidebar + account Payments link | Task 1 |
| Payments CTAs pending_review / paid | Task 2 |
| Login return to CourseDetail | Task 3 |
| No auto pay modal | Task 3 acceptance |
| No backend unless course_id missing | Task 2 Step 1 |
| Out of scope C/D/B | Not in plan |

## Placeholder scan

No TBD/TODO left in task steps. CourseDetail query param explicitly `courseId`.
