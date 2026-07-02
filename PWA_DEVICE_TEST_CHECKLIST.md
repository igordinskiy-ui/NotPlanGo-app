# NotPlanGo PWA Device Test Checklist

Use this checklist on the production HTTPS URL after deploy.

## Android Chrome

- Open the HTTPS URL.
- Install from browser menu or install prompt.
- Launch NotPlanGo from the home screen.
- Add a task, mark it done, close the app, reopen it.
- Confirm the task state is preserved.
- Turn on airplane mode after the first successful visit.
- Launch from the home screen again and confirm the app opens offline.
- Export JSON from Week or Settings.

## iPhone Safari

- Open the HTTPS URL in Safari.
- Use Share -> Add to Home Screen.
- Launch NotPlanGo from the home screen.
- Confirm the app opens standalone, with the NotPlanGo title and icon.
- Add a task, mark a habit, close the app, reopen it.
- Confirm local data is preserved.
- Turn on airplane mode after the first successful visit.
- Launch from the home screen again and confirm the app opens offline.
- Export JSON from Week or Settings.

## Release Gate

- `npm install` succeeds.
- `npm run build` succeeds.
- Manifest includes PNG `192x192`, `512x512`, maskable PNG, and apple touch icon.
- Service worker is served with `Cache-Control: no-cache`.
- HTTPS deploy URL passes browser installability checks.
