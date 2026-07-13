# Architecture

NotPlanGo is a local-first React PWA. It has no server, account, or remote sync.

## Runtime boundaries

- `src/main.tsx` currently contains domain rules, state migration, browser storage, PWA/notification adapters, and UI screens. New work should keep those concerns separate even while the file is decomposed incrementally.
- `src/sw.ts` owns offline navigation fallback, cache cleanup, update activation, and notification click navigation.
- `public/manifest.webmanifest`, `vite.config.ts`, and deployment headers define installability and browser security policy.

## Data lifecycle

`PlannerState` v3 is the in-memory source of truth. A change is debounced before persistence; hiding or leaving the page flushes the most recent state.

1. The primary browser copy and emergency auto-backup are written to `localStorage`.
2. A serialized IndexedDB snapshot is written as a resilience copy.
3. Startup prefers the synchronous primary copy; restore prefers IndexedDB and falls back to the auto-backup.
4. Portable JSON export is the only cross-device backup. Import validates supported versions, dates, collection sizes, IDs, and text limits before replacing the current state.

## Target module layout

The next refactor should extract small, independently tested modules without changing behavior:

```text
src/
  domain/       state types, date/task rules, migration and import validation
  storage/      localStorage, IndexedDB, backup and persistence queue
  platform/     notifications, service-worker registration, PWA status
  hooks/        persistence, reminders and viewport behavior
  components/   dialogs, screens and reusable controls
  main.tsx      application composition only
```

## Testing map

- Unit tests cover domain rules, import validation, persistence queues, backup parsing, reminders, search, and PWA helper logic.
- `npm run build` runs TypeScript checking and produces the production PWA bundle.
- `npm run verify:pwa` validates generated PWA configuration and assets.
- Browser-level offline, update, IndexedDB, and keyboard-dialog tests are the next testing layer; see `ROADMAP.md`.
