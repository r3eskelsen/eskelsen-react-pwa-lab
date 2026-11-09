# Architecture

## Boundaries

Single React/TypeScript application; no API, account service or real remote database. Synthetic tasks only. IndexedDB database `eskelsen-fieldnote-lab` version 2 holds tasks, outbox and sync state. Schema migration creates missing stores and preserves existing v1 task/outbox data.

## Write and sync lifecycle

1. Save the latest task snapshot and its outbox operation in one transaction. Deleted tasks retain tombstones.
2. Prepare one in-flight command per task: freeze its latest snapshot and covered outbox IDs. Multiple intermediate edits coalesce; this is snapshot synchronization, not an event-replay ledger.
3. Commit the simulated remote record and receipt in sync storage.
4. Acknowledge only a matching persisted accepted receipt. Update the known revision and delete only frozen covered operation IDs. Newer edits remain queued.
5. A retry uses the same operation ID and payload, returning the existing receipt without another remote revision.
6. On revision mismatch, keep the queue until explicit resolution. Local choice creates a new command using the current remote revision. Remote choice verifies the unchanged local snapshot, archives the discarded edits and replaces only that task.

Participating panels use the Web Locks name `eskelsen-fieldnote-sync` to serialize sync operations across windows. Task edits are separate atomic transactions. This is not a full collaborative editor: stale visual state and simultaneous local edits in multiple windows are not merged.

## Offline shell

Build-time SHA-256 input includes index, icons, manifest and bundled assets. The worker precaches this exact set, serves root navigation from that version's index and handles only its own same-origin allowlisted files. No API responses or task records are cached by the worker. Activation deletes only older caches with the Fieldnote shell prefix. Waiting updates require old clients to close; IndexedDB is not deleted.

## Reconnect

The checkbox controls simulated transport availability. It is independent of navigator.onLine and origin-server health. Enabling it drains the queue; a five-second interval and online event retry while the page is open. The flag resets off when the page is reopened. No background sync delivery, closed-app delivery or real network transport is claimed.
