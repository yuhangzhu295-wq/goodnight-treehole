# UI V2 visual review — independent reviewer, pixel analysis

Reviewer: a sub-agent working from the images only, dispatched 2026-10-19, after the queue was
reconciled against disk (`scripts/reconcile-ui-queue.mjs`: 91 screenshots, no corrections, nothing
needing a human read on the `rendered` axis).

**Method disclosure, in the reviewer's own words.** The reviewing session could not render images
(all images were silently omitted by the provider), so the review is **pixel-level analysis** — Python/PIL
brightness profiles, per-strip standard deviation, content-coverage percentage, white-band counts,
red-pixel counts, and quadrant comparison — not a sighted read. Every verdict below is derived from
that evidence. The consequence is stated plainly: **subtle defects are below this method's
resolution.** Colour-token drift, font-weight differences, 2–4 px spacing deviations and text-content
differences would not be caught. The three FAIL pages and the two INCONCLUSIVE pages still need a
sighted look, and this document does not close them.

`visualApproved` and `codeReviewApproved` are **not** flipped. This is the evidence, not the verdict.

## Result

**39 tasks in the queue. 20 were compared against a design/screenshot pair; 19 have no capture.**

How the 20 were reached, so the number can be re-derived rather than trusted:

- **17** resolve from the task's own `screenshot` field. Three of those (UI-V2-05, UI-V2-10,
  UI-V2-15) hold a brace-expansion list rather than a single path, so the first member that exists is
  the one compared.
- **3** more — UI-V2-01 TonightHome, UI-V2-03 ActionCenter, UI-V2-04 Me — are named in the task's
  evidence notes as re-captured on device (`R1_TonightHome_after_RECAPTURED.png`,
  `R1_ActionCenter_current.png`, `R1_Me_after_RECAPTURED.png`) and were compared from those.
- The other **19** have no file under `artifacts/ui-v2/android/`. **14** of those are Round 4
  (UI-V2-22–28, 30, 31, 33–35, 38, 39); the remaining five are UI-V2-19 MemoryCenter (recorded as
  unreachable on the emulator), UI-V2-21 Archive, UI-V2-32 ReportMonth, UI-V2-36 PrivacySettings
  (landed on the wrong page twice), and UI-V2-37 DataPolicy.

Of the 20 compared, the verdicts are mutually exclusive and add up:

| Verdict | Count | Tasks |
| --- | --- | --- |
| PASS | 17 | 02, 03, 04, 05, 06, 07, 08, 09, 11, 12, 14, 15, 16, 17, 18, 20, 29 |
| FAIL | 0 | — |
| INCONCLUSIVE | 3 | 01, 10, 13 |

17 + 0 + 3 = 20. The counts changed once, after the three FAILs were re-tested against a live device
and found to be capture artefacts (see the correction section). Two *earlier* versions were also
wrong in a different way: one listed UI-V2-01 as both INCONCLUSIVE and PASS, and both inherited a
summary line of "13 PASS" that did not match the per-page table it summarised. The per-page table is
the evidence in every case.

## Correction: the three FAILs were not product defects

The pixel review below was written from the captures on disk. Re-testing them against a live device
(emulator-5554, app running, API reachable over `adb reverse`) showed that **all three were
capture-state artefacts**, not rendering defects. The originals are kept as invalid evidence. Both the originals and the recaptures live under
`artifacts/ui-v2/android/`, which is gitignored - the evidence is on the machine that ran the
review, not in the repository, and this document names the exact files so it can be re-checked.

| Task | Original verdict | What re-testing showed |
| --- | --- | --- |
| UI-V2-20 DecisionVault | FAIL — whole content area dark | The page's computed background is `rgb(255,255,255)`, opacity 1, filter none. A fresh capture measures mean 242.9 / median 255 / 27.8% content, against the design's ~250. The old capture measured 84% non-white at a uniform `(170,173,175)` — a dimming scrim over the whole content area, present at capture time and absent from the page. |
| UI-V2-29 MeProfile | FAIL — blank page, only an error line | The old capture had 0.5% content because the app held **no identity** (the API was unreachable at launch, so `ensureIdentity()` returned null and `/me/profile` answered 401). With an identity present the same route returns 200 and the page renders the full profile: 10.0% content, name, anonymous code, account status. |
| UI-V2-10 PeerConversation | FAIL — message list blank | The page loads `/api/v1/peer-conversations` and selects the one matching its `matchId`. The capture's viewer owned none of the five conversations in the database, so an empty list was the **correct** render for that viewer. Not a defect; also not evidence of a populated conversation. |

What this means for the counts: **PASS 17, FAIL 0, INCONCLUSIVE 3** (01, 13, and 10 — 10 is now
inconclusive rather than failed because a populated capture requires a viewer who owns a
conversation, which this run could not produce).

The general lesson is recorded in `feedback-screen-is-not-evidence`: a capture taken in a broken
environment is not evidence about the product. The R3 batch was taken while the API was unreachable,
which is why two of its pages look empty and one looks dimmed.

## Original FAIL findings (superseded — kept so the error is auditable)

**1. UI-V2-20 `DecisionVault` — the whole content area renders dark.**
Content-area mean brightness 179.2 on screen against 250.3 in the design, a 28% difference, with the
centre row sampling `[170,173,175]` uniformly where the design is `[255,255,255]`. Every other page in
the project renders its content area at 235–255. This is a page-wide dark treatment on one page only,
which points at a scoped-style or dark-mode class applied to this route alone rather than a global
theme change. It is the highest-impact finding because it is visible before reading anything.

**2. UI-V2-29 `MeProfile` — the only capture is the API-failure state.**
The capture has 584 non-white pixels in the middle 60% and 2,545 pure-white strips; the design shows
26,611 (3.4%). The screenshot is a blank white page with a small red error element. The queue already
records that the success state is unverified, so this is a capture gap rather than a new defect — but
it means the page has never been visually accepted at all.

**3. UI-V2-10 `PeerConversation` — the message list area is blank in the "after" capture.**
2.1% non-white content against the design's 7.7%, with 15 of 20 vertical strips at pure white. For a
chat page exercised through 12–13 real messages, the "after" state should show populated bubbles.
Three candidate causes, not distinguishable at this resolution: history failed to render, the capture
is at the top of an empty scroll, or bubbles render white-on-white.

## INCONCLUSIVE — needs a sighted read

**4. UI-V2-13 `SafetySupport` — the emergency block is 2.1× the design's area.**
118,463 medium-red pixels spanning 16.8–35.7% of screen height, against the design's 55,136 spanning
15.0–30.5%. The block is in the right place, but it is substantially larger. On a safety-critical page
a deviation in the danger zone has to be seen, not inferred.

**5. UI-V2-01 `TonightHome` — an unexpected red accent near the top.**
1,251 red pixels at 6.5–8.2% from the top that the design does not have, with the screen also
measuring sparser than the design overall (3.9% vs 7.1% coverage, 10 white bands vs 6). Small, but on
a mental-health product an unexplained red element under the header deserves eyes on it.

## NO_CAPTURE — 19 tasks

UI-V2-19, 21–28, 30–39 (Round 4 in full, plus MemoryCenter, Archive, PrivacySettings, DataPolicy,
ReportMonth). UI-V2-19 is recorded as unreachable on the emulator; UI-V2-36 landed on 生活恢复 on two
navigation attempts. No visual review is possible for any of these, and `rendered: no` is the honest
state until a capture exists.

## What this does and does not establish

- Established: for the 20 pages with a capture, whether the render is structurally the right page and
  free of gross defects. 17 of the 20 are clean by that measure; 3 could not be judged from pixels,
  and none carries a confirmed defect.
- Established: 3 concrete, reproducible defects with pixel evidence attached.
- Not established: any claim about the 19 uncaptured pages, about text content, or about
  sub-pixel-level visual fidelity on any page.
- The queue's `visualApproved` stays `no` on all 39 and `codeReviewApproved` stays `no` on all 39.
