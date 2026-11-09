# Test plan and evidence mapping

| ID | Requirement / procedure | Expected | Actual / evidence |
| --- | --- | --- | --- |
| T01 | Create, complete, delete; reload/reopen Chrome | Task state and queue survive | PASS manual owner report and screenshots; G2_P3 evidence |
| T02 | Stop origin server; reload, create, reopen Chrome | Cached app and committed records survive | PASS manual owner report; G2_P5 offline record |
| T03 | Install Chrome app; stop server and relaunch | Standalone app opens with records | PASS manual owner report/screenshots; G2_P5 install record |
| T04 | New build; wait, close old clients, reopen | New panel appears, old data retained | PASS manual screenshots; G3 Chrome sync record |
| T05 | Connect simulated server; drain queue | Pending IDs removed after receipt | PASS manual Chrome and automated storage tests |
| T06 | Simulated competing edit, local choice | Conflict blocks; new local command succeeds | PASS manual Chrome and automated conflict tests |
| T07 | Same conflict, remote choice | Remote selected; discarded changes archived | PASS manual Chrome and automated conflict tests |
| T08 | Lose ACK, reconnect | Queue preserved first; receipt count unchanged on retry | PASS manual Chrome and automated storage/engine tests |
| T09 | Add newer edit before ACK | New operation survives acknowledgement | PASS automated storage test |
| T10 | New edit before remote-choice decision | Abort without loss of newer edit | PASS automated conflict test |
| T11 | Remote changes again after local resolution | Conflict detected again | PASS automated conflict test |
| T12 | Original v1 schema with data; open v2 | Migration preserves tasks and outbox | PASS fake-indexeddb test; browser preservation manually supported |
| T13 | Edge task, basic sync, stopped-server reopen | Isolated state survives and syncs | PASS owner page-text reports; G3 Edge record |
| T14 | Invalid command / reused operation ID | Rejected | PASS engine tests |
| T15 | Fresh locked install, full tests, production build | Reconstruct successfully | PASS independent container run; evidence/review |

Reproduce automated cases with `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, then `npm run build`. Manual browser actions require the exact origin http://127.0.0.1:4173; use normal reloads. Never clear original evidence or real browser storage to manufacture a clean result.

Untested: Edge standalone install, mobile/browser matrix beyond those named, physical power loss, cache corruption, quota denial, real HTTP synchronization and multi-device conflicts. These are not PASS.
