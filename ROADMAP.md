# Roadmap

This roadmap records deliberately deferred work. It is not a delivery commitment.

## Engineering

- Incrementally split `src/main.tsx` according to `docs/ARCHITECTURE.md` while preserving the existing v3 data contract.
- Add browser integration tests for onboarding, import/export, IndexedDB fallback, service-worker updates, offline navigation, and keyboard dialog behavior.
- Introduce an explicit archive policy and UI only after choosing retention duration and recovery behavior. Automatic history deletion is intentionally not enabled because past weeks remain a visible product feature.

## Product decisions requiring separate design

- Reliable background reminders need a chosen push/backend architecture, permission UX, operational ownership, and a privacy review; browser timers alone cannot provide them.
- Multi-device sync, accounts, and conflict resolution need authentication, encrypted transport/storage, data retention, deletion flows, and a security/privacy review.
- Calendar interchange, tags, recurring-task exceptions, undo, and backup history need product semantics before implementation.
