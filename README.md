# NotPlanGo

Mobile-first PWA for weekly planning: Today, Week, Habits, Settings, local-first storage, JSON export/import, and installable PWA assets.

## Stack

- React + TypeScript + Vite
- Motion animations
- Plain CSS with theme variables
- `localStorage` fallback plus IndexedDB latest snapshot
- PWA manifest and service worker
- No backend, auth, or payments yet

## Local Development

```bash
npm install
npm run dev
```

The dev server runs on `0.0.0.0` by default. For local browser testing, open:

```text
http://127.0.0.1:5173/
```

## Verification

```bash
npm test
npm run build
npm run verify:pwa
npm audit
```

Current local verification status:

- `npm test`: 6 tests passing.
- `npm run build`: passing.
- `npm run verify:pwa`: passing.
- `npm audit`: 0 vulnerabilities.
- Local browser smoke at 390x844: task persistence, theme persistence, Settings controls.

GitHub Actions CI runs install, tests, production build, PWA asset verification, and audit on `main` pushes and pull requests.

## PWA

The app includes:

- PNG icons for `192x192`, `512x512`, maskable icon, and `apple-touch-icon`.
- `public/manifest.webmanifest`.
- `public/sw.js`.
- Vercel and Netlify header configs.
- Manifest screenshots copied into `public/marketing-screenshots`.

Production PWA gates still require real-device checks:

- Android Chrome install, home-screen launch, offline launch.
- iPhone Safari Add to Home Screen, standalone launch, offline launch.
- JSON export from the installed app.

Use [PWA_DEVICE_TEST_CHECKLIST.md](./PWA_DEVICE_TEST_CHECKLIST.md) before treating a deploy as ready for daily use.

## Data Model

All planner data is local to the browser:

- App bootstrap loads the latest IndexedDB snapshot first.
- `localStorage` remains a fallback and migration copy.
- Settings shows storage usage, persistence status, backup availability, and restore controls.
- JSON export/import is the manual portability and backup path.

There is no server sync yet. Users should export JSON before destructive resets or important weekly reviews.

## Product Roadmap

See:

- [PRODUCT_AUDIT_AND_ROADMAP.md](./PRODUCT_AUDIT_AND_ROADMAP.md)
- [SECURITY_MONETIZATION_PLAN.md](./SECURITY_MONETIZATION_PLAN.md)

Recommended monetization path is free local PWA plus one-time Pro unlock. Do not implement paid entitlement as a plain frontend/localStorage flag.
