# Results — 2026-11-09

## Evidence basis

The owner executed Windows commands and manual Chrome/Edge scenarios and supplied terminal output/screenshots/page text. A separate container review verified the uploaded archive and reproduced the locked install, tests and production build. Browser interactions were not independently replayed in the container.

- Uploaded review ZIP SHA-256: FEC4AA0BF1B4A2846C608C797B729EDE749496AC7C7F2C070243897C7A309F46.
- All 90 inventory entries matched their hashes before review edits.
- Windows full run: 18 passing nodes (16 cases plus 2 groups), zero failures.
- Independent original-source run: same counts; service worker build identity a7510db83e7bd4e3 reproduced.
- Final package adds an npm test command and revises explanatory copy only; final test/build results are in evidence/review.
- npm audit snapshot: zero reported vulnerabilities across the installed dependency graph. This is a point-in-time registry report, not a security certification.
- Chrome: installation, stopped-origin loading, data preservation across updates, queue drain, simulated reconnect, local/remote conflict resolutions and lost-ACK duplicate suppression supported by owner evidence.
- Edge: initially empty browser state, basic queue drain and stopped-origin reopen supported by owner page-text evidence. Installation and full fault scenarios were not tested in Edge.

## Gate assessment

G3: PASS for the stated limited demo test matrix; excluded and untested cases remain listed in LIMITATIONS.md. G4: source/documentation/package prepared for manual GitHub upload. GitHub publication: PENDING owner action. G5 portfolio publication: PENDING; no promotional asset or portfolio entry is claimed as delivered. G6 commercial feedback: NOT STARTED.

Sanitized evidence copies omit local user paths and source backups. Original terminal evidence remains in the owner's project folder. Sanitized copies are not byte-identical to originals and old evidence manifests must not be used to validate the final source.
