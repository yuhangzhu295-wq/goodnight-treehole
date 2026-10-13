# Closing the demo-user fallback (Batch 3 finding 6)

**Status: CLOSED.** 21 C-end routes no longer decide identity from the demo-user fallback.

## What finding 6 said, and what was actually true

The design doc recorded: *"Self routes still silently fall back to the demo user"*, citing
`controllers.ts:665–742,779–795`. Those line numbers now contain the **peer** routes, which use
`requireRuntimeUserId` — they were fixed during the Batch 2 / R-11 work. So the finding's citations
were stale.

The same shape survived on **21 other routes**, none of them Self routes: the older
letters / diaries / favorites / tools / feedback / moods family.

## The exposure, measured rather than inferred

`scripts/audit-demo-fallback-exposure.mjs` calls the read routes with **no credential** and reports
what comes back:

| Route | Before |
| --- | --- |
| `GET /api/v1/diaries` | 200 |
| `GET /api/v1/diaries/months` | 200 |
| `GET /api/v1/favorites` | 200 |
| `GET /api/v1/feedback` | 200 |
| `GET /api/v1/letters` | 200 |
| `GET /api/v1/letters/today` | 200 **and returned a real record** |

Six of six reads answered without a credential, and one of them served the demo user's letter. An
unauthenticated caller was being treated as `user_demo`.

## The rule this violated

R-06 already established the product rule: *"Production requests MUST supply an identity header;
requests with no identity are refused with 401 rather than falling back to demo user."* These routes
were simply not covered by it. This change applies an existing decision; it does not make a new one.

## What changed

`requestedUserId || this.store.getDemoUserId()` → `requireRuntimeUserId(requestedUserId)` on the five
routes that already accepted a header, and the header parameter plus the same call on the sixteen
that accepted none. `scripts/audit-demo-fallback-routes.mjs` maps every remaining fallback to its
route, so the set is measured rather than eyeballed.

Two fallbacks remain, both intentional:

- `POST /api/v1/auth/demo` — issues the demo identity, gated by `ALLOW_DEMO_IDENTITY`. That is its
  purpose.
- `POST /api/admin/v1/ai/routes/:style/test` — behind `this.admin(auth)`; the demo id is the
  attribution of an admin-triggered AI job, not an identity decision.

## Verification

| Check | Result |
| --- | --- |
| unauthenticated reads | **0 of 6** answered; all six now 401 |
| authenticated reads | still 200, `/letters/today` still returns its record |
| full business suite | 42/42 files, 277 passed / 0 failed / 7 skipped |
| `pnpm typecheck`, `pnpm lint` | clean |

## The seven specs that broke, and why that is the right outcome

Seven specs called these routes **without an identity**, relying on the fallback that was just
removed: `front-letter`, `front-square-interaction`, `front-tools`, `front-publish-private`,
`persistence-durability`, `third-stage-archive`, `third-stage-privacy-2`. They now send the demo
identity, which is what a real client does (`apps/mp/src/api.ts` awaits `ensureIdentity()` before
every call). One of them, `third-stage-privacy-2`, expected **403** and got 401 — it had been getting
a privacy refusal because the fallback supplied a user at all.

Two tooling notes, because both cost time and both are the same class of mistake:

1. The first mechanical insertion put `.set(...)` **before** the method call. Supertest only exposes
   `.set()` on the Test that `.get()/.post()` returns, so every call failed with
   `default(...).set is not a function`.
2. The same script counted a replacement as applied without checking that the line had changed, so a
   multi-line chain it could not match was reported as fixed. It now logs
   `NOT CHANGED (multi-line chain? fix by hand)` and does not increment.
