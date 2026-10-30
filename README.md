# Evenday

A calm life organizer: see what's due today, what's coming up, and reach the apps you use most. This is a **browser prototype**, not an App Store build.

- **Today**: date, schedule, upcoming events, overdue and due tasks, favorite shortcuts, quick add.
- **Calendar**: month view, agenda for the selected day, events with times or all-day, locations, notes and category colors.
- **Tasks**: Today, Upcoming and Done views, due dates, priority, categories, Undo after completing or deleting.
- **Apps**: a grid of website shortcuts with optional app links. Reorder with arrow buttons, star a shortcut to show it on Today.
- **Settings**: light/dark/system theme, week start, export and import a backup, sample data, erase all data.

No account, no backend, no API keys. Data is saved in the browser's `localStorage` on the device.

## Run it

Requires Node 18 or newer. There are no dependencies to install.

```bash
npm start
```

Open http://localhost:5173. To try it on a phone on the same Wi-Fi, open the second address the server prints.

Any static server works too, for example `python3 -m http.server 5173`. Opening `index.html` straight from disk won't work because browsers block ES modules on `file://`.

**Install as an app:** in Chrome or on a Chromebook, use *Install Evenday* in the address bar. On an iPhone, use Safari's Share → *Add to Home Screen*.

## Test it

```bash
npm test
```

Runs 20 end-to-end checks in headless Chromium: tasks, events (including a DST-change date), shortcuts, persistence, export/import, theme, keyboard, overflow at 320–1280px, and reset. It needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium` if you don't have it).

Keyboard: press `n` to add, `Esc` to close a sheet, arrow keys to move between calendar days and task tabs.

## Project layout

```
index.html            entry page
css/styles.css        design tokens (light + dark) and all styles
js/app.js             shell, hash routing, actions
js/store.js           data model, validation, persistence, import/export, sample data
js/dates.js           local date helpers (dates stored as YYYY-MM-DD, never UTC)
js/forms.js           task, event and shortcut editors
js/components.js      shared rows, tiles and empty states
js/views/*.js         Today, Calendar, Tasks, Apps, Settings
sw.js, manifest       offline support and install metadata
scripts/serve.mjs     zero-dependency dev server
scripts/build-artifact.mjs  single-file build for hosted previews (uses esbuild via npx)
tests/e2e.mjs         end-to-end checks
```

## Known limitations

- Data lives in one browser on one device. Clearing site data erases it, so export backups. There's no sync.
- Events are single-day. There are no repeating events, overnight events (ending after midnight) or reminders/notifications yet.
- App links (like `spotify:`) depend on the device. A web page can't tell whether an app is installed or whether the link opened it. Evenday tries the app and offers the website if the page is still in view after about a second. App links haven't been tested on real iOS or Android devices.
- Websites open in a new tab, so the destination page decides whether it opens in its native app.

## Path to the App Store

1. **Wrap the web build** with [Capacitor](https://capacitorjs.com) (`@capacitor/ios`). The app is already static HTML/CSS/JS, so it can be dropped in as-is.
2. **Swap web-only pieces for native plugins:** move storage from `localStorage` to SQLite or Preferences, use Local Notifications for reminders, use the Share sheet / Filesystem for export, and use `canOpenURL` (with `LSApplicationQueriesSchemes`) for reliable app links.
3. **Test on real devices:** safe areas, Dynamic Type, VoiceOver, dark mode, and offline use on several iPhone sizes, then TestFlight.
4. **Privacy:** write a privacy policy and fill in App Store privacy "nutrition labels". The current design collects nothing, which keeps this simple. Add a privacy manifest (`PrivacyInfo.xcprivacy`) covering any required-reason APIs the native plugins use.
5. **Submit:** you'll need an Apple Developer account, App Store Connect listing, screenshots, review notes and an age rating. Check the current App Review Guidelines before submitting.

## Monetization direction (not implemented)

Keep the core free forever: no ads, no subscription, no paywall on your own data.

Recommended: a single optional **one-time "Evenday Plus" unlock** that adds premium themes and app icons, extra category colors, planning templates (school term, moving house, trip packing) and advanced views. Optionally, sell individual theme packs as one-time purchases. Show it in Settings, never as interruptive prompts.

On iOS, digital unlocks generally have to use Apple's In-App Purchase (non-consumable products). Rules vary by region and change over time, so check the current guidelines before building payments. There are no revenue promises here.

## Next steps

1. Repeating events and simple reminders (needs notifications, so best done with the native wrapper).
2. Capacitor iOS shell with native storage and real-device testing.
3. Optional calendar import (read-only `.ics`) before any two-way sync.
4. Task search and a lightweight "this week" view.
