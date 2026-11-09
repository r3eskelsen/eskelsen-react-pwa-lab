# Fieldnote — React PWA Lab

An independent Eskelsen Systems technical demonstration of an installable task application, offline persistence and browser-local simulated synchronization.

**This is a laboratory demo, not a production service.** Both the device records and the simulated remote records live in the same browser profile. No task data is uploaded. Different browsers and devices do not share tasks.

## Quick start

Use Node.js 24 and npm. The author tested Windows with Node 24.22.2 and npm 11.19.1; the supplied source was independently rebuilt with Node 24.22.1. Dependencies are pinned in package-lock.json.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
npm run preview
```

Open http://127.0.0.1:4173 in a normal browser window. Keep this exact origin throughout the demo. The preview server binds only to loopback and refuses another port when 4173 is occupied. Stop it with Ctrl+C. `npm run dev` is for development; use the production build and preview for service worker tests.

## What it demonstrates

- React and strict TypeScript task creation, completion and soft deletion.
- IndexedDB tasks and outbox writes in one transaction.
- Versioned service worker precache of the application shell, manifest and PNG icons.
- Standalone installation manually verified in Chrome on Windows.
- Persistent in-flight commands, revision conflicts, receipt-based duplicate suppression and explicit local/remote resolution.
- Simulated reconnect and five-second retries while the app is open and its simulated connection is enabled.

## Try the scenarios

1. Create a task with **Simulated connection** off. Reload; the task and pending operation remain.
2. Turn the simulated connection on. The queue drains after acknowledgement.
3. Turn it off, change a task, then click **Lose next acknowledgement**. A simulated remote commit is saved but the pending operation remains. Reconnect: the queue drains without increasing the stored receipt count again.
4. With a clean queue, click **Simulate remote edit**. This targets the first task in the current stored sort order and turns the simulated connection off. Toggle that same task locally and reconnect. Choose **Keep local** or **Use remote** when the conflict appears.
5. For offline loading, visit online, wait for service worker control, reload normally, stop preview, then reload and reopen the page. This tests an unavailable origin server; it does not prove every physical network failure mode.

`Use remote` archives both versions and discarded operations in the browser's sync state. The demo has no archive export/restore UI. If newer local edits invalidate the decision snapshot, remote acceptance aborts rather than discarding those edits.

## Updates and installation

Build, start preview and visit the app. When **Update ready** appears, close every Fieldnote tab and installed window before reopening. The waiting worker activates naturally; no forced skipWaiting is used. Use the browser's install control for standalone installation. Rich install screenshots, protocol handlers and custom window controls are optional and not supplied.

## Verification

`npm test` reports **18 passing test nodes: 16 individual cases and two parent groups**. Node tests use in-memory fake-indexeddb, not your browser data. See [results](docs/RESULTS.md) for the separate Windows manual evidence and independent container checks. Do not describe these results as production certification or commercial deployment experience.

## Repository map

| Path | Purpose |
| --- | --- |
| src/db.ts | IndexedDB schema, tasks and atomic outbox writes |
| src/sync-engine.ts | Pure simulated revision/receipt transition |
| src/sync-storage.ts | Durable in-flight, acknowledgement and conflict operations |
| src/SyncPanel.tsx | Simulated connection and fault controls |
| scripts/build-sw.mjs | Content-derived offline shell generation |
| tests/ | Node regression tests |
| docs/ | Architecture, test plan, limits and release record |
| evidence/ | Sanitized text evidence; original local evidence stays with the owner |

## Hosting and rights

The current build assumes a dedicated origin root (`/`). A GitHub repository is supported; deployment at a GitHub Pages repository subpath is **not configured**. Public hosting requires HTTPS (loopback is used for the local demo). Vite preview is a local test server, not production hosting.

No open-source license grant has been selected. Original project code remains all rights reserved; see LICENSE and THIRD_PARTY_NOTICES.md. Publishing a repository does not grant commercial reuse rights.
