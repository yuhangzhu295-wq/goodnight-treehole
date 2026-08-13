# GoodnightTreeHole delivery rules

These rules apply to every future change in this repository.

1. Never render a design reference as a full-page background or use transparent hotspots.
2. Never ship fake buttons, toast-only actions, frontend-hardcoded AI results, or text that pretends a file was uploaded.
3. Every upload must use a real file, real preview, real persisted media record, and a real storage adapter.
4. Do not reuse one generic AI page merely by changing its title. Each tool needs its own task type, input, output contract, and UI.
5. Tests must assert business outcomes, not just HTTP 200 or clickability.
6. For critical flows verify UI → API → database → refresh persistence → cross-end synchronization.
7. Frontend and admin must consume the same authoritative runtime data source.
8. Every AI invocation must create a real asynchronous AiJob and record provider/model/status/result or error.
9. Visual regression must use local tooling and cannot be skipped because an external visual-AI key is missing.
10. Exclude browser chrome, OS notifications, and screenshot-tool UI from product visual assertions.
11. Restart real services and re-verify after implementation changes. Never report a test as passed unless it was actually run.
12. Never weaken product behavior to satisfy automation, remove correct features to evade a test, or conceal unresolved failures. Diagnose failures and continue repairing them.

13. For the long-running `admin-rebuild-phase-0-to-6` objective, never stop at a phase boundary. After recording a phase checkpoint and report, immediately continue to the next phase.
14. Always read `artifacts/checkpoints/admin-rebuild.json` before resuming the admin rebuild. Historical PASS claims without current browser, API, database, and persistence evidence are unverified.
15. Only mark the admin rebuild `VERIFIED_PASS` after Phases 0–6, cross-end business flows, visual acceptance, and clean-restart regression all have current evidence.
