# Spec C — Admin payment queue + coupon on payment list

**Date:** 2026-08-11  
**Status:** Approved for planning (pending user review of this file)  
**Series:** E order — A → **C** → D → B (this doc is C only)  
**Depends on:** Spec A complete (local); `payments.coupon_id` + `dbo.coupons` already exist

## Goal

Admins clear the **pending_review** slip queue faster (oldest first, in-place row update) and see/filter payments that used a **discount coupon**.

## Non-goals

- Bulk / multi-select approve → not in this round  
- Coupon redemption history UI → **Spec D**  
- Learner dashboard → **Spec B**  
- New payment admin page or new queue API  
- Changing approve/reject business rules (`markPaidAndEnroll`, reject reason flow stay)

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| Fast queue | Default tab `pending_review`; oldest slip first; after approve/reject update local list + repaint (no full reload every time) |
| Coupon UI | Column (code + discount) + filter มีคูปอง / ไม่มีคูปอง |
| Approach | Extend existing `GET /api/admin/payments` + `renderPayments()` in `Admin.html` |

## Current baseline

- UI: `frontend/Admin.html` → `renderPayments()` — tabs `pending_review` / `paid` / `rejected` / `all`; default already `pending_review`
- API: `GET /api/admin/payments` in `backend/adminRoutes.js` — filters `status`, `source`; SELECT has `access_code` but **not** `coupon_id` / coupon code
- Order today: pending_review first, then `COALESCE(transfer_at, created_at) **DESC**` (newest first within group)
- Approve/reject: POST `/api/admin/payments/:id/approve|reject` then UI typically reloads list

## Design

### 1. API — extend `GET /api/admin/payments`

**File:** `backend/adminRoutes.js`

- LEFT JOIN `dbo.coupons cp ON cp.coupon_id = p.coupon_id`
- SELECT add:
  - `p.coupon_id`
  - `cp.code AS coupon_code`
  - `cp.discount_amount AS coupon_discount`
- New query param `coupon`:
  - `yes` → `AND p.coupon_id IS NOT NULL`
  - `no` → `AND p.coupon_id IS NULL`
  - omit / empty → no coupon filter
- Keep existing `status` and `source` filters (`direct_signup`, `access_code`; also allow `source=coupon` if useful)
- Sort:
  - When `status=pending_review` (or default client tab implies pending-only fetch optional): within pending, **ASC** by `COALESCE(p.transfer_at, p.created_at)` (oldest first)
  - For other status filters / all: keep status-priority CASE, then within group **DESC** (newest first) — OR always ASC for pending_review rows in the CASE ordering
  - Practical rule:  
    `ORDER BY CASE status… END,`  
    then `CASE WHEN p.status = 'pending_review' THEN COALESCE(transfer_at, created_at) END ASC,`  
    then `COALESCE(transfer_at, created_at) DESC`  
    so pending queue is oldest-first; other tabs still feel “latest first”

No schema migration.

### 2. Admin UI — `renderPayments()`

**File:** `frontend/Admin.html`

**Column คูปอง** (after ที่มา or ช่องทาง):
- If `coupon_code`: show code + discount (e.g. `SAVE500 · ลด ฿500`)
- Else: `—`

**Coupon filter control** (near status tabs):
- ทั้งหมด (ไม่กรองคูปอง) | มีคูปอง | ไม่มีคูปอง  
- Combines with status tab (client-side filter on loaded rows **or** refetch with `?coupon=yes|no` — prefer **client-side** on already-loaded TOP 300 if API returns coupon fields for all; if using server filter, refetch when coupon filter changes)

Preferred: load once with coupon fields; filter coupon client-side like status tabs (simpler, matches current status filtering). Server `?coupon=` still available for future / deep links.

**Source badge (optional polish):** if `source === 'coupon'`, show a coupon-flavored badge; not required if column is clear.

### 3. Fast queue behavior

- Default `filter = 'pending_review'` (already)
- After successful approve or reject:
  - Update that payment in the in-memory `payments` array (status change / remove from pending view)
  - Call `paint()` without awaiting full `api('/api/admin/payments')`
  - Optionally toast/message success (existing pattern)
- On first open and on explicit refresh (if any): still fetch from API
- If approve/reject API fails: keep row; show error (existing)

### 4. Copy

- Thai-first labels: คูปอง, มีคูปอง, ไม่มีคูปอง, ลด ฿…
- No new i18n required unless Admin already keys every string

## Acceptance criteria

1. Pending-review tab lists oldest awaiting slips first.
2. After approve/reject success, that row leaves the pending queue without a full list refetch.
3. Payment table shows coupon code + discount when `coupon_id` set; otherwise `—`.
4. Admin can filter มีคูปอง / ไม่มีคูปอง while keeping status tabs.
5. Approve/reject still enroll / notify as today.
6. Spec D/B unchanged; no bulk approve.

## Test plan (manual)

1. Admin → ชำระเงิน → default tab รอตรวจสอบ; confirm older slip above newer.
2. Approve one → row gone from pending; open อนุมัติแล้ว → appears paid.
3. Reject one → leaves pending; visible under ปฏิเสธ.
4. Create/pay with coupon → list shows code + discount; filter มีคูปอง shows it; ไม่มีคูปอง hides it.
5. Payment without coupon shows `—` and appears under ไม่มีคูปอง.

## Out of scope reminders

- Redemption history (D)  
- Learner dashboard (B)  
- Bulk approve  
