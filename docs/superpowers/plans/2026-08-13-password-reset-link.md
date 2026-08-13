# Password Reset Link Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Replace OTP password reset/change with a one-time email link and `reset-password.html`.

**Architecture:** Extend `emailOtp.js` with reset-token issue/consume + HTML email with button; wire Login/Settings to request-link APIs; new public reset page.

**Tech Stack:** Node/Express, in-memory token Map, existing SMTP/Brevo, static frontend HTML/CSS/JS.

## Global Constraints

- Token TTL 30 minutes, single-use, hashed at rest in memory
- Link uses `APP_BASE_URL` / `PUBLIC_BASE_URL` / `http://localhost:3000`
- Min password length remains 4 (existing rule)
- Do not commit secrets or uploads

---

### Task 1: Backend reset-link helpers + APIs

**Files:** `backend/emailOtp.js`, `backend/server.js`, `backend/profileRoutes.js`

- [ ] Add `issuePasswordResetLink`, `peekPasswordResetToken`, `consumePasswordResetToken`, `sendResetLinkEmail`
- [ ] `POST /api/users/request-reset-link`, `GET /api/users/reset-token`, `POST /api/users/reset-password`
- [ ] `POST /api/profile/password/request-reset-link` for logged-in users
- [ ] Keep admin OTP test as-is

### Task 2: Reset page + Login/Settings UI

**Files:** `frontend/reset-password.html`, `frontend/Login.html`, `frontend/login.js`, `frontend/login.css` (as needed), `frontend/Settings.html`, `components/i18n-dict.js`

- [ ] Build reset-password page (password + confirm)
- [ ] Simplify Login forgot modal to send-link only
- [ ] Simplify Settings security section to send-link only
- [ ] Update i18n strings for send-link copy

### Task 3: Verify + ship

- [ ] Smoke-check routes/handlers for obvious errors
- [ ] Commit + push `main` (exclude secrets/scratch)
