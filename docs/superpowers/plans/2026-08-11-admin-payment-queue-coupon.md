# Admin Payment Queue + Coupon Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Oldest-first pending payment queue with in-place approve/reject updates, plus coupon column and มีคูปอง/ไม่มีคูปอง filter on Admin payments.

**Architecture:** Extend `GET /api/admin/payments` JOIN coupons; adjust ORDER BY; update `renderPayments()` in Admin.html for column, filter, and local-array paint after approve/reject.

**Tech Stack:** Express + mssql, Admin.html vanilla JS

**Spec:** `docs/superpowers/specs/2026-08-11-admin-payment-queue-coupon-design.md`

## Global Constraints

- No bulk approve; no Spec D/B; no new queue API
- Default tab remains `pending_review`
- Coupon filter client-side preferred; API may still accept `?coupon=yes|no`
- Thai-first labels

---

### Task 1: Extend admin payments API

**Files:** Modify `backend/adminRoutes.js` (`GET /payments`)

- [ ] JOIN coupons; select coupon_id, coupon_code, coupon_discount
- [ ] Support `?coupon=yes|no`
- [ ] ORDER BY so pending_review is oldest-first
- [ ] Commit: `feat(admin): expose coupon fields and oldest-first pending payments`

### Task 2: Admin UI column, filter, in-place queue

**Files:** Modify `frontend/Admin.html` (`renderPayments`)

- [ ] Column คูปอง + mobile card line
- [ ] Filter มีคูปอง / ไม่มีคูปอง
- [ ] After approve/reject: update `payments[]` + paint (no full refetch)
- [ ] Commit: `feat(admin): show coupon on payments and speed pending queue UX`

### Task 3: Manual smoke

- [ ] Pending order, approve without full reload, coupon filter
