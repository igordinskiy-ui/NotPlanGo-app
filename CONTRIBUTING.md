# Contributing

Use Node.js 22 and npm 10 or newer.

```bash
npm ci
npm test
npm run build
npm run verify:pwa
```

Keep changes local-first: do not add network calls, analytics, credentials, or external storage without an explicit product and privacy decision.

When changing state or import behavior, preserve migration compatibility, add validation for untrusted JSON, and add a regression test. Verify a manual JSON export/import and local backup restore when changing storage code.

For UI work, retain keyboard access, visible focus, descriptive labels, and mobile-sized tap targets. PWA changes should be checked after a production build with an offline reload and an update flow.
