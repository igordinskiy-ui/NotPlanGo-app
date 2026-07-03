# NotPlanGo Product Audit And Roadmap

## Current Readiness

- Personal daily use readiness: **7/10** after the latest fixes.
- Product/commercial readiness: **4/10**.
- Best current fit: local-first weekly planner for one user who is ready to keep manual JSON backups.

The app is already usable as a private PWA MVP: Today, Week, Habits, Settings, local persistence, PWA manifest, service worker, JSON import/export, install assets, and HTTPS deployment config are in place.

## Recent P0 Fixes

- Future tasks outside the current week are now visible in Week as "Ближайшие планы".
- Weekly rollover no longer multiplies the same daily repeated task from every day of the previous week.
- Existing tasks planned for the next week are preserved when repeated tasks are generated.
- Settings now shows storage status, backup availability, persistent-storage request, and restore from local IndexedDB snapshot.
- JSON import is size-limited and normalized defensively.
- Vitest test coverage now protects week rollover, future-task visibility, and import normalization.
- App bootstrap now loads IndexedDB first and uses `localStorage` as fallback/migration storage.
- Destructive reset confirmations now include a direct JSON export action.
- Settings now includes 8 saved color theme presets.
- Persistence now goes through one in-app storage adapter instead of scattered UI calls.
- Backup snapshot tests now prevent recursive backup growth.
- Week and Settings now show the last manual JSON export status.

## Remaining Product P0

1. Finish storage resilience QA.
   - Keep IndexedDB-first loading.
   - Keep `localStorage` only as fallback/migration copy.
   - Add browser-level tests for storage failures and restore flow.
   - Verify restore/export on real Android and iPhone.
2. Expand critical tests.
   - Backup restore.
   - Destructive reset confirmations.
   - Storage failure handling.
   - Service worker update toast.
3. Run real-device PWA QA.
   - Android Chrome install, home-screen launch, offline launch.
   - iPhone Safari add-to-home-screen, launch, offline launch.
   - Verify service worker update toast.
4. Validate destructive reset flows on real devices.
   - Confirm JSON export works from reset dialogs on Android Chrome and iPhone Safari.

## P1: Daily Use Quality

1. Week navigation.
   - Previous/next week controls.
   - Open a historical week, not only show its percent.
   - Move unfinished items into the current week deliberately.
2. Proper recurring-task model.
   - Store repeat rules separately from generated task instances.
   - Support end date and weekdays.
   - Avoid duplicated generated instances.
3. Global search.
   - Search tasks, goals, summaries, habits, and historical weeks.
   - Move it out of Settings.
4. Weekly review flow.
   - Review unfinished tasks.
   - Export JSON.
   - Copy selected goals/tasks to next week.
5. Onboarding.
   - First-run choice: demo data or empty planner.
   - Brief privacy/local-storage warning.

## P2: Competitive Differentiation

1. Privacy-first Pro features.
   - Encrypted backup file.
   - Markdown/CSV export.
   - Templates and copy previous week.
   - Local analytics for sleep, energy, mood, habits.
2. Optional sync tier.
   - Encrypted cloud backup.
   - Cross-device sync.
   - Account recovery.
3. Mobile polish.
   - Notification reminders.
   - Better calendar picker.
   - More compact Today layout for heavy task days.
   - Accessibility pass: focus states, reduced motion, labels.

## Monetization Path

Recommended model: **Free local PWA + one-time Pro unlock** first.

Free should include the full basic planner: Today, Week, Habits, local data, JSON export/import, basic repeats, and manual backups.

Pro V1 should be local-first and not require server costs:

- templates
- copy previous week
- encrypted backup file
- Markdown/CSV export
- richer history
- local analytics
- advanced recurring tasks

Subscription should wait until there is recurring server value:

- encrypted cloud backup
- sync
- email backup reminders
- web account/license portal

## Monetization Architecture Requirements

- Never store paid entitlement as a plain `localStorage` boolean.
- Use a merchant service or backend for checkout and webhooks.
- Store only a signed entitlement token/client license in the app.
- Keep payment secrets completely outside the frontend.
- Add privacy policy, terms, refund/support contact, and clear local-data warning before charging.

## Positioning

NotPlanGo should not compete by becoming a heavier Todoist clone. The stronger positioning is:

> A calm, private, mobile-first weekly planner for people who want a simple ritual, not a noisy productivity system.

To defend that position, the product must be more reliable than a spreadsheet, clearer than a generic todo app, and safer about local data than a throwaway browser toy.
