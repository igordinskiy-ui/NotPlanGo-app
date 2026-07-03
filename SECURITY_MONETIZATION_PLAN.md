# NotPlanGo Security And Monetization Plan

## Current Security Baseline

- No backend, auth, payments, or external API calls in the app runtime.
- `npm audit` currently reports 0 known vulnerabilities.
- Direct XSS sinks such as `dangerouslySetInnerHTML`, `eval`, and manual `innerHTML` are not used.
- PWA install assets exist: PNG icons, maskable icon, `apple-touch-icon`, manifest, and service worker.
- Vercel and Netlify configs include baseline security headers.

## Security Changes Already Applied

- Added `vercel.json` with:
  - `Content-Security-Policy`
  - `X-Content-Type-Options`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `/sw.js` no-cache header
  - SPA rewrite fallback
- Mirrored the same baseline security headers into `netlify.toml`.
- Copied manifest screenshots into `public/marketing-screenshots` so the manifest references files that ship in `dist`.
- Added import hardening:
  - max JSON import size
  - basic NotPlanGo shape validation
  - defensive normalization of tasks, goals, habits, logs, backups, and settings
- Added safer persistence:
  - `try/catch` around local saves
  - user-facing save failure toast
  - IndexedDB latest snapshot restore path when primary local state is missing
- Added Settings storage controls:
  - visible storage usage/quota and persistence status
  - manual `navigator.storage.persist()` request where supported
  - latest local backup timestamp
  - manual restore from the latest IndexedDB snapshot
- Changed app bootstrap to load the latest IndexedDB snapshot before falling back to `localStorage` or demo data.
- Added a direct JSON export action inside destructive reset confirmations.
- Moved runtime persistence calls behind a single in-app storage adapter.
- Added visible last manual JSON export status in Week and Settings.

## Remaining Security P0

1. Finish storage adapter hardening.
   - keep IndexedDB-first loading
   - keep `localStorage` as fallback/migration copy
   - add browser-level tests for storage failure and restore flow
2. Add stronger schema validation with a real parser, for example Zod.
3. Add a stronger backup-before-destructive-reset flow:
   - validate export flow on real Android and iPhone
4. Run Lighthouse PWA/installability checks against the Vercel HTTPS URL.
5. Verify on real Android Chrome and iPhone Safari.

## Monetization Direction

Recommended first business model: **Freemium + one-time Pro unlock**.

This fits the product better than forcing a subscription too early because NotPlanGo's strongest promise is privacy-first, low-noise, local-first weekly planning.

### Free

- Today, Week, Habits, Settings
- local-first storage
- JSON export/import
- basic week goals and daily tasks
- simple habits

### Pro V1

- week templates
- copy previous week
- flexible habits: target N times per week
- month/history view
- Markdown/CSV export
- encrypted backup file
- advanced backup/restore UI
- richer local analytics

### Pro V2 / Subscription Candidate

Only add subscription when the paid value includes recurring cost or server value:

- encrypted cloud backup
- cross-device sync
- email backup reminders
- hosted account/license portal
- optional web dashboard

## Required Changes Before Charging

1. Product/legal:
   - landing page
   - privacy policy
   - terms
   - clear local-data warning
   - refund/support contact
2. Billing:
   - Stripe Checkout or Lemon Squeezy/Paddle
   - entitlement model
   - license/account recovery
3. App architecture:
   - isolate Pro feature gates
   - split storage/state/components from `src/main.tsx`
   - add tests for paid/free boundaries
4. Security:
   - do not put payment secrets in frontend
   - backend or managed merchant service for checkout webhooks
   - signed entitlement, not plain localStorage flag

## 30/60/90 Commercial Roadmap

### 30 Days

- Polish free local PWA.
- Ship Vercel HTTPS URL.
- Add security/storage P0 items.
- Keep IndexedDB-primary storage and schema validation ahead of paid launch.
- Add onboarding and privacy-first positioning.
- Add public demo/landing page.

### 60 Days

- Add Pro-local features without sync:
  - templates
  - copy week
  - Markdown/CSV export
  - flexible habits
  - restore UI
- Add checkout and account/license backend.

### 90 Days

- Decide based on usage:
  - keep one-time Pro if local-first users convert
  - add subscription only if encrypted sync/backup is built
- Add content/template packs.
- Consider app-store wrappers only after web conversion and retention are proven.
