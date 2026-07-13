# Privacy

NotPlanGo stores planner data locally in the browser on the current device. This can include tasks, goals, habits, day logs, reminder preferences, and export timestamps.

The current application has no account, analytics, server database, or synchronization service. It does not intentionally transmit planner content. A deployment host can still process ordinary web-request metadata such as IP address and user agent under its own policy.

The browser stores a primary copy, an IndexedDB snapshot, and an emergency auto-backup. They can be removed by clearing browser or site data, browser eviction, or loss of the device. Use JSON export for an independent backup; importing a JSON file replaces the current planner state.

Notifications require browser permission. They are scheduled only while the browser or installed PWA is active and are not a guaranteed background delivery service.

To erase local data, use the in-app reset controls and clear the site's browser storage. Remove any downloaded JSON exports separately.
