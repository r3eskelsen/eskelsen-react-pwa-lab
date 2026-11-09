# Limitations and risks

- Browser-local simulated remote storage is not a backup or real multi-device synchronization. Simulated sync can run even while the local preview server is stopped.
- No authentication, encryption at rest, tenant boundaries, payments, regulatory compliance or production availability guarantees.
- Clearing site data, private mode, browser eviction, quota exhaustion and device loss can destroy data. Committed transactions are not a universal power-loss durability guarantee.
- Reads scan all tasks/outbox entries. Remote state and receipts are cloned and rewritten as a single value; tombstones, receipts and resolution history grow without compaction. Intended for small synthetic datasets.
- Revision checks protect simulated remote conflicts. Simultaneous local edits from stale tabs can overwrite one another; reload after external changes. Multi-window consistency has not been certified.
- Conflict processing pauses the queue at the in-flight task. Resolving another simultaneous remote change can require another decision.
- Invalid decisions and transaction aborts can surface a generic error. If a new local edit makes a remote-choice snapshot stale, keep local to resubmit the latest snapshot; no automatic discard is performed.
- Input validation is for the typed internal demo command shape, not a hardened untrusted public API.
- Installation and full conflict/ACK UI paths were manually tested in Chrome Windows. Edge has basic task/simulated sync and server-unavailable loading evidence. Edge installation, mobile installation, Firefox and Safari are untested.
- Service worker tests used a stopped local origin server, not every network interruption, process crash, device power loss or corrupted cache scenario.
- Root-only deployment: dedicated origin required. Repository-subpath hosting requires code changes.
- Current rights are reserved. Select an explicit open-source license separately if desired; do not describe the repository as MIT-licensed.
