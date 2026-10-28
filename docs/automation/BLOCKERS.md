# Blockers

| ID | Task | Kind | Detail | Workaround in force |
| --- | --- | --- | --- | --- |
| BL-1 | B3-R05 review | provider | `architecture-reviewer` stream dropped mid-response (`stream closed before response.completed`); no verdict produced. | Task marked `WAITING_REVIEW`; other independent tasks continue. Do **not** self-approve. |
| BL-2 | B3-R02 | scope | The two synchronous display projections (`decoratePost`, `peerExperienceSummary`) need an async call graph; `peerExperienceSummary` has 14 call sites, several inside the synchronous `peerMatchForUser`. | Authorization gates already read the database; the display half is recorded, not hidden. |
| BL-3 | P10 | external | `.env` has an empty `DAPI_API_KEY`, so real DAPI calls cannot succeed. | `DAPI_VERIFIED=false`, `QA_ALL_PASS=false`. The development agent's model is unrelated to the product DAPI and must never stand in for it. |
| BL-4 | P7 | hardware | No physical Android device; only an emulator. | `PHYSICAL_ANDROID_VERIFIED=false`; no iOS toolchain, so `IOS_NATIVE_VERIFIED=false`. |
| BL-5 | APPCLOSE | unidentified | `app.close()` stalls 30–120 s intermittently. Both provider shutdown hooks return in milliseconds, the HTTP server reports zero connections and closes in 0–1 ms, so the stall is inside `app.close()` after those. | Test teardown is bounded and reports the stall; the product-side unbounded Redis close is bounded. Not claimed as fixed. |
| BL-6 | any | environment | The WSL2 VM shuts down when no session holds it, killing the database containers; under sustained load unrelated specs hit `Test timed out in 5000ms`. | A long-lived WSL session is held open; regression judgement only uses runs taken when the machine is idle. |
