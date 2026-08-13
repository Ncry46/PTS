# Password reset via email link

**Date:** 2026-08-13  
**Status:** Approved (user: approach A, scope Login + Settings, Settings = send link only)

## Goal

Replace OTP-based password reset/change with a one-time email link that opens a dedicated page to set a new password.

## User flows

### Forgot password (Login)

1. User opens forgot-password popup and enters account email.
2. System emails a “ตั้งรหัสผ่านใหม่” link (no OTP code).
3. User opens `reset-password.html?token=…`, sets new password + confirm.
4. Success → redirect to Login.

### Change password (Settings, logged in)

1. User clicks “ส่งลิงก์เปลี่ยนรหัสผ่านไปที่อีเมล”.
2. Same email + same reset page as above.
3. No current-password or OTP fields on Settings.

## Architecture

- Reuse existing mail delivery (SMTP / Brevo / console) in `backend/emailOtp.js`.
- Add in-memory reset-token store (same process pattern as OTP):
  - Token: 32 random bytes hex
  - Store keyed by SHA-256(token): `{ email, purpose, expiresAt }`
  - TTL: 30 minutes, single use, new issue invalidates prior tokens for same email+purpose
- Link base: `APP_BASE_URL` / `PUBLIC_BASE_URL` (fallback `http://localhost:3000`)
- Link path: `/reset-password.html?token=…`

## APIs

| Method | Path | Auth | Role |
|--------|------|------|------|
| POST | `/api/users/request-reset-link` | no | body `{ email }` → send link (`purpose=reset`) |
| POST | `/api/profile/password/request-reset-link` | session | send link to logged-in user’s email (`purpose=change_password`) |
| GET | `/api/users/reset-token?token=` | no | validate token (for page UX) |
| POST | `/api/users/reset-password` | no | body `{ token, new_password }` → update `password_hash`, consume token |

Keep `/api/users/request-otp` and `/api/users/verify-otp-reset` as thin aliases or remove from UI only; admin mail test may still send OTP for delivery checks.

## UI

- **Login modal:** email + “ส่งลิงก์” only; copy explains check inbox; remove OTP / new-password fields from modal.
- **Settings security column:** email (disabled) + send-link button + message; remove current/new password + OTP inputs and save-password for this flow.
- **New page** `frontend/reset-password.html`: token from query, password + confirm, submit, errors for invalid/expired token.

## Errors

- Unknown email (forgot): keep current 404 messaging (or generic success if we later harden enumeration — out of scope).
- Invalid/expired/used token: clear Thai message + link back to Login forgot flow.
- Mail not configured: 503 with existing mail error codes.

## Out of scope

- Persisting tokens in SQL
- Removing admin OTP test mail
- Password strength beyond existing min length (4)
