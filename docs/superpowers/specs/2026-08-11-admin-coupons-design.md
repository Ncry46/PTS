# Admin discount coupons — design

**Date:** 2026-08-11  
**Status:** Implemented (approach 2 — separate from Access Codes)

## Goal

Admins can create alphanumeric discount coupon codes per course, email them to users (manual email or pick from user list), and learners apply them at checkout. Discount is a fixed THB amount, may reduce price to 0, and must not exceed course price.

## Usage rules (admin chooses)

- `once` — one redemption total  
- `max_uses` — capped total uses  
- `once_per_user` — one per user (optional total cap)

## Surfaces

- Admin: `Admin.html` tab **คูปองส่วนลด**  
- APIs: `/api/admin/coupons`, send-email; learner `/api/coupons/validate`, `/api/coupons/apply`; pay accepts `coupon_code`  
- Checkout: `pay-modal.js` coupon field

## Data

- `dbo.coupons`, `dbo.coupon_redemptions`, `payments.coupon_id`
