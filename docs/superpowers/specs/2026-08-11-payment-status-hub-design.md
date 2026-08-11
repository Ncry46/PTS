# Spec A — Payment status hub + login return to course

**Date:** 2026-08-11  
**Status:** Approved for planning (pending user review of this file)  
**Series:** E order — A → C → D → B (this doc is A only)

## Goal

Learners always know where a payment stands (`pending` / `pending_review` / `paid` / `rejected`) and what to do next. After logging in from a course page, they return to that course (not Home).

## Non-goals (later specs)

- Admin payment queue / coupon on admin list → **Spec C**
- Coupon redemption history UI → **Spec D**
- Dashboard continue-learning / promo blocks → **Spec B**
- New payment status page (reuse existing `Payments.html`)
- Auto-open pay modal after login

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| Status hub | Reuse `frontend/Payments.html` |
| Nav | Add link in user sidebar + account dropdown |
| Post-login | Return to `CourseDetail.html?id=…` (learner clicks enroll again) |
| CTAs | `pending_review` → view course; `paid` → continue learning |

## Current baseline

- Statuses on `dbo.payments.status`: `pending`, `pending_review`, `paid`, `rejected`
- Learner API: `GET /api/my/payments` (already used by Payments.html)
- Login already honors safe `?next=` in `frontend/login.js`; Google auth stores `googleLoginNext`
- CourseDetail enroll-login CTA currently points to `Login.html` **without** `next=`
- Payments.html is **not** linked from `components/user-sidebar.js` or learner account menu in `components/navbar.js`
- Existing CTAs: resume slip/card for `pending` / `rejected`; none for `pending_review` / `paid`

## Design

### 1. Navigation

**Files:** `components/user-sidebar.js`, `components/navbar.js` (and i18n keys if already present: `nav.payments` / `side.payments`)

- Sidebar (logged-in learner): add **การชำระเงิน** → `Payments.html`, placed after **หลักสูตรของฉัน**
- Navbar account dropdown: same link
- Do not add Payments to guest navbar
- Active-state match: `/Payments\.html/i`

### 2. Payments.html — status list CTAs

**File:** `frontend/Payments.html` (history list from `loadPayments`)

Per row, keep existing method/source/amount/reference/reject_reason display. Buttons:

| Status | Primary CTA | Target |
|--------|-------------|--------|
| `pending` (promptpay) | แนบสลิป (existing) | Scroll to slip upload on same page |
| `pending` (card) | ชำระด้วยบัตร (existing) | Card form on same page |
| `pending_review` | **ดูรายละเอียดคอร์ส** (new) | `CourseDetail.html?id={course_id}` |
| `rejected` | ส่งสลิปใหม่ (existing) | Slip upload on same page |
| `paid` | **เข้าเรียนต่อ** (new) | `Learn.html?courseId={course_id}` |

Notes:

- Require `course_id` on each payment row from API (already expected on my/payments payload; if missing, omit CTA and keep status label only).
- Coupon / access_code paid rows use the same `paid` CTA.
- Optional short helper text under status is allowed if it stays one line (e.g. “รอแอดมินตรวจสอบสลิป”) — no new page sections.

### 3. Login return to course

**Files:** `frontend/CourseDetail.html` (and any CourseDetail login links for enroll)

- Enroll CTA when logged out:  
  `Login.html?next=` + URL-encoded `CourseDetail.html?id={courseId}`
- Other CourseDetail “เข้าสู่ระบบ” links that block enroll/review should use the same `next` when a course id is known
- Safe `next` rules stay as today: relative path only, no `://`
- Google login: pass the same `?next=` so `googleLoginNext` session path works
- After login success → land on CourseDetail; **do not** auto-open pay modal

### 4. API / backend

- Prefer **no backend change** if `GET /api/my/payments` already returns `course_id` and `status`.
- If `course_id` is missing from the response, add it to the SELECT in `backend/learningRoutes.js` (`/my/payments`) only — no schema migration.

### 5. Copy / i18n

- Thai-first labels as above; reuse existing i18n keys for nav when present.
- New button labels can be inline Thai first (match Payments.html style); optional i18n keys if the page already uses `data-i18n` heavily.

## Acceptance criteria

1. Logged-in learner sees **การชำระเงิน** in sidebar and account menu; click opens Payments.html.
2. On Payments history: each of the four statuses shows the CTA in the table above (when `course_id` exists).
3. Logged-out user on CourseDetail clicks enroll-login → Login → lands back on that CourseDetail (same id).
4. Google login with `?next=` also returns to that course when OAuth completes.
5. No auto-open of payment modal after login.
6. Specs C/D/B unchanged.

## Test plan (manual)

1. Log in → open sidebar → **การชำระเงิน** → list loads.
2. Create promptpay payment → see `pending` + แนบสลิป; upload → `pending_review` + ดูรายละเอียดคอร์ส.
3. Admin approve → `paid` + เข้าเรียนต่อ opens Learn for that course.
4. Admin reject → `rejected` + ส่งสลิปใหม่ + reason visible.
5. Log out → CourseDetail → เข้าสู่ระบบเพื่อสมัครเรียน → log in → back on same course page.
6. Repeat step 5 with Google login if credentials available.

## Out of scope reminders

- Admin coupon column / filters (C)
- Redemption history (D)
- Dashboard promo / schedule polish (B)
