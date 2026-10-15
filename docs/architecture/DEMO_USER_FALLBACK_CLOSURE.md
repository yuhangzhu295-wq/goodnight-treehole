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

---

# Second pass: the write paths (2026-10-15)

The pass above closed the **read** routes that decided identity from the fallback. It did not cover
the **write** paths, because those did not consult the identity at all - there was no `||` to
replace. `createMood` set `userId = this.getDemoUserId()`, a fixed string, and the route passed no
user, so the caller's identity was never read.

## What was measured

`scripts/verify-mood-owner.mjs` issues a real anonymous session, creates a mood with that credential,
and reads the row back from PostgreSQL:

```
anonymous session issued for user_anon_4cdab0e4
create status 201
rows in postgres: [{"id":"mood_92bc45e525","userId":"user_demo", ...}]
expected userId: user_anon_4cdab0e4
VERDICT: WRONG OWNER - attributed to user_demo
```

`scripts/probe-mood-ownership-visibility.mjs` then asks who can read it back:

```
A creates a mood -> 201
  stored under userId: user_demo
  A (creator) GET /diaries -> 200, sees the record: false
  B (stranger) GET /diaries -> 200, sees the record: false
  demo         GET /diaries -> 200, sees the record: true
A sees it: NO - the creator lost the record
```

So this was not a paper mis-attribution. The user wrote a mood, the request returned 201, and the
record was absent from their own diary list while the demo account held it. A second probe of the
same constant found "not interested" was global: hiding a post wrote to `user_demo` and the feed read
the same constant back, so one user's hide removed the post for everybody.

## What changed

Two helpers, so the intent is stated once:

| Helper | Returns | Used for |
| --- | --- | --- |
| `viewerUserId()` | the identity, or `null` | per-viewer reads: hides, `favoritedByCurrentUser` |
| `requireViewerId()` | the identity, or **401** | writes, which must have an owner |

Applied to `createMood`, `uploadMedia`, `createFeedbackTicket`, `createReply`,
`hidePostForCurrentUser`, `decoratePost` and `publicPosts`. The parameter defaults that silently
supplied the demo id - `assertCanWrite`, `createDiaryExport`, `getDiaryExportDownload`,
`getExportDownload` - are now required parameters, so a caller cannot inherit an owner by omitting an
argument.

The guard is in the store, not the route, because ownership is decided there. The spec therefore
asserts against the service directly as well as over HTTP: a route-only check would let the
service-level one be deleted without any test going red, which is how the fallback survived the first
pass.

## Reverse proof

Each guard was reverted to its old behaviour and the spec re-run. The failures are the ones the test
names, not incidental ones:

| Mutation | Result |
| --- | --- |
| `createMood` -> `getDemoUserId()` | 3/5 failed: `expected 'user_demo' to be 'user_guest'`; `expected 401 "Unauthorized", got 201 "Created"`; `promise resolved ... instead of rejecting` (service-level guard) |
| `hidePostForCurrentUser` -> `getDemoUserId()` | 2/5 failed, including `expect(visibleTo(other)).toBe(false)` - the hider still saw the post |
| `decoratePost` -> `getDemoUserId()` | 1/5 failed: `expected false to be true` - the caller's own favourite was not reported |

Tests: `tests/business/cend-write-ownership.spec.ts`, 5/5, run three times consecutively with the
database up. `typecheck` clean. Two fixtures that relied on the fallback
(`front-publish-private.spec.ts`, `api.spec.ts`) now send the demo identity explicitly, which is what
a real client does.

## Still open after this pass

- **`queueAI`'s `input.userId ?? this.getDemoUserId()`** is unreachable today - all ten call sites
  pass an explicit user - but it is the same shape and is left for Batch 4 rather than changed here,
  so this pass stays measured.
- **`POST /api/admin/v1/ai/routes/:style/test`** keeps the demo attribution deliberately: it is the
  attribution of an admin-triggered job, not an identity decision.

## The same defect on `GET /api/v1/tonight`, found by following the constant

Once `createMood` was fixed, the remaining uses of `getDemoUserId()` were re-read. `tonightHome()`
took `userId = this.getDemoUserId()` and the route called it with no argument, and unlike the writes
this one was **documented as intentional**: the identity matrix listed `/api/v1/tonight` under
"Genuinely Public Routes (By Design)" as a "Tonight summary and inspirational quote".

The implementation is not a summary. It returns the caller's active journey, active actions, due
check-ins, follow-ups, peer matches and latest letter. Measured against the running API:

```
GET /api/v1/tonight with no credential
  -> 200 { journey: { userId: "user_demo", visibility: "PRIVATE", title: "毕业同意复现" }, ... }
GET /api/v1/tonight with an unrelated fresh anonymous credential
  -> 200, identical payload
```

`tonightHome` now takes a required `userId` and the route resolves the caller, so no identity is a
401. Reverse proof: restoring the old route and default fails exactly the two new assertions
(`expected 401 "Unauthorized", got 200 "OK"` and `expected undefined to be 'user_guest'`).

The lesson worth keeping: the wrong description was in the specification, not the code, so reading
the matrix could not have found this. Following every remaining use of the constant did. The matrix
row is corrected in `SELF_ROUTE_IDENTITY_MATRIX.md` §4, and §5 there lists the write routes that
§2 never covered.

