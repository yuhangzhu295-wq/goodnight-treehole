# Batch 3 gate — `SELF_ROUTE_IDENTITY_PASS`

**Status: ESTABLISHED** for the identity and ownership axes, with the consent axis stated separately
in §4. This is the second of the eight Batch 3 gates to be established
(`SELF_FULL_FLUSH=false` was the first).

**Claim.** Every route in `SELF_ROUTE_IDENTITY_MATRIX.md` §2 refuses a request that carries no
identity, and every route that names a record refuses a caller who is not its owner.

## 1. Method — measured, not eyeballed

`scripts/audit-identity-gate-coverage.mjs` parses the 91 rows of the matrix table and looks for each
route in the specs, attributing every hit to the section that provides it. Eyeballing a 91-row table
against a test file is how a gap gets missed, and a "Negative Test" column reads as evidence whether
or not the named test exists.

Two checks, deliberately different for two kinds of route:

| Route kind | Required evidence | Why |
| --- | --- | --- |
| any | a request with no credential → **401** | identity is the precondition for everything else |
| one with a path parameter | a request with **another user's id** → refusal | the route names a record, so a foreign id is expressible |
| one without (`/me/...`, a list) | nothing extra | scoped to the caller by construction; a per-route foreign-id test cannot exist |

Foreign-id evidence is credited at the strength it actually has:

| Source | Strength | Covers |
| --- | --- | --- |
| `batch3-identity-matrix.spec.ts` §3 | HTTP, one area per test | 15 routes |
| `batch3-foreign-id-ownership.spec.ts` | HTTP, one case per route | 17 routes |
| `batch2-peer-verification.spec.ts` 3.3 | **persistence layer**, not HTTP | 11 routes |

## 2. Measured position

```
matrix routes parsed:                 91
  with a 401 negative test:           87 / 87 C-end routes
  admin routes with a negative test:  4 / 4
  parameterised C-end routes:         43
  of those, foreign-id covered:       43
      matrix-section  15
      http            17
      db-layer        11
VERDICT: every matrix route is covered by the section it belongs to
```

`batch3-foreign-id-ownership.spec.ts`: **16/16**. `batch3-identity-matrix.spec.ts`: **27/27**.

Every case in the foreign-id spec carries its own control: the same request is also sent by the
record's **owner**, and the owner must not get 404. Without that, a route that is misspelled - or one
whose id resolves for nobody - would refuse the stranger too, and a stranger-only assertion would
report a pass. The control deliberately does not require the business action to succeed, because
several of these routes have state preconditions that are not the subject of this gate.

## 3. Reverse proof

`requireJourney` is the guard that enforces ownership for the journey family. Replacing its
owner-scoped lookup with the unfiltered `getJourneyById` - the mutation named **M-F** - fails **8 of
the 16** cases, each with `stranger got 200` or `stranger got 201`: the stranger's request succeeded.
The guard is load-bearing, and the tests discriminate.

## 4. What this gate does not claim

- **The consent axis is enumerated from the code, not asserted per route.** Every consent decision
  goes through `privacyAllows` (16 call sites), which reads the committed row. That a central helper
  exists says nothing about which routes reach it, and a route that stopped calling it would look
  identical - so `pnpm audit:route-consent` parses `controllers.ts`, follows each handler to the store
  method it calls, and from there to the `privacyAllows` call that guards it. Result: of 170 C-end
  routes, 15 reach a consent gate (listed with the flag and the store method they pass through), 13
  more are named as having no gate for a stated reason (public feed, consent editor itself,
  attachments, identity issuance, diagnostics), 5 are edits of content whose creation was gated or the
  bilateral consent mechanism itself, and the rest are reads of the caller's own records. One gate -
  the human-reply one - is additionally pinned by
  `tests/business/privacy-gate-reads-database.spec.ts` with its own mutation (M-E).
  `scripts/audit-route-consent-coverage.mjs` is the source of that breakdown; this paragraph is a
  summary of its output, not a hand-kept table.
- **The peer family's ownership evidence is at the persistence layer.** `batch2-peer-verification`
  3.3 exercises every direct peer operation with a non-participant caller; it is stronger evidence
  about ownership than an HTTP status would be, but it is not per-route HTTP coverage and is labelled
  `db-layer` rather than `http` for that reason.
- **A route the audit cannot find is a candidate gap, not proof of one.** The script matches paths as
  written in the table; a test reaching a route through a helper or a differently spelled placeholder
  would not be credited. Every gap it reported in this pass was read before being acted on, and two
  were real: `GET /api/admin/v1/memory/:id` had no negative test at all, and the two journey-scoped
  peer routes were not exercised with a foreign id.
- **The matrix's own "Negative Test" column was wrong.** It named tests such as
  *"Peer: User C is refused on match between A and B"* and attributed them to
  `batch3-identity-matrix.spec.ts`; those names occur **nowhere in the repository**, and the peer
  coverage that does exist lives in the Batch 2 spec. The column read as evidence while pointing at
  nothing. That is the failure mode this gate exists to catch, and it was in the document, so no
  amount of reading the document would have found it.

## 5. Follow-up

| # | Item | Status |
| --- | --- | --- |
| 1 | Per-route identity (401) for every matrix route | done — 87/87 C-end, 4/4 admin |
| 2 | Per-route foreign-id refusal for parameterised routes | done — 43/43 |
| 3 | Mutation proving the journey owner guard is load-bearing | done — M-F, 8/16 fail |
| 4 | Per-route consent negative tests | enumerated from code by `pnpm audit:route-consent` — 15 gated routes traced to their `privacyAllows` call; a negative test per gated route is still not claimed |
| 5 | Correct the matrix's Negative Test column | open — §4 records the defect; the column itself still names tests that do not exist |
