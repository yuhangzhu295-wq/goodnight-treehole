# Self Route Identity & Fallback Matrix

**Document status:** Normative specification of caller identity sources, fallback behaviour before and after review finding R-06, and ownership enforcement for all Self and related subsystems.
**Related:** `docs/architecture/BATCH3_SELF_SYSTEM_DESIGN.md` §0.5/A8, `docs/automation/AUTONOMOUS_STATE.md` (finding 6).

---

## 1. Architectural Rule & Defense-in-Depth

### The Defect (Review Finding R-06)
Before this task, many Self routes accepted an optional `x-goodnight-user-id` header. When the header was missing or empty, `StoreService.resolveRuntimeUserId` silently fell back to the demo user (`user_demo`). Furthermore, several Self routes (including Decision, Cooldown, FutureMessage, and certain Journey lifecycle steps) accepted no identity header at all, hardcoding `user_demo` inside `StoreService`.

Consequently, unauthenticated requests with no identity could read, mutate, or delete private data belonging to `user_demo`.

### The Invariant
1. **No Implicit Demo Fallback:** Any Self-system route invoked without caller identity (`x-goodnight-user-id`) MUST be refused with **HTTP 401 Unauthorized**.
2. **Explicit Bounded Identity:** A client-supplied `x-goodnight-user-id` is validated against known persisted anonymous users. If the user ID format is invalid or the user does not exist, access is refused with **HTTP 404 Not Found** (`当前匿名会话用户不存在`).
3. **Cross-User Isolation (Ownership Check):** User A can only read, mutate, and delete their own records. When User B attempts to access or mutate User A's record by identifier, the request is refused with **HTTP 404 Not Found** (or 403 where applicable), preventing information disclosure or unauthorized mutation.
4. **Admin Route Protection:** Admin sensitive read endpoints (`/api/admin/v1/...`) require an admin session token in the `Authorization: Bearer <token>` header. Standard user identity (`x-goodnight-user-id`) or unauthenticated callers are refused with **HTTP 401 Unauthorized**.
5. **Preserving Test Fixtures:** Test fixtures needing the demo user must explicitly send `x-goodnight-user-id: user_demo` (or use `demoUserHeaders()`), keeping `user_demo` isolated and never implicitly assumed.

---

## 2. Route Identity Matrix

| Method | Path | Identity Source | Fallback Before | Fallback After | Ownership Check | Negative Test (`batch3-identity-matrix.spec.ts`) |
|---|---|---|---|---|---|---|
| **Privacy** | | | | | | |
| GET | `/api/v1/settings/privacy` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `Privacy: unauthenticated request is refused with 401` |
| GET | `/api/v1/me/privacy` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `Privacy: unauthenticated request is refused with 401` |
| GET | `/api/v1/privacy-settings` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `Privacy: unauthenticated request is refused with 401` |
| PUT | `/api/v1/settings/privacy` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `Privacy: unauthenticated request is refused with 401` |
| PATCH | `/api/v1/settings/privacy` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `Privacy: unauthenticated request is refused with 401` |
| PATCH | `/api/v1/me/privacy` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `Privacy: unauthenticated request is refused with 401` |
| PATCH | `/api/v1/privacy-settings` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `Privacy: unauthenticated request is refused with 401` |
| **Memory** | | | | | | |
| GET | `/api/v1/memory` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Filters `item.userId === callerId` | `Memory: unauthenticated request is refused with 401` |
| GET | `/api/v1/me/memories` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Filters `item.userId === callerId` | `Memory: unauthenticated request is refused with 401` |
| POST | `/api/v1/memory` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Associated to caller `userId` | `Memory: unauthenticated request is refused with 401` |
| PATCH | `/api/v1/me/memories/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `memory.userId === callerId` | `Memory: User B is refused on User A record` |
| DELETE | `/api/v1/memory/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `memory.userId === callerId` | `Memory: User B is refused on User A record` |
| DELETE | `/api/v1/me/memories/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `memory.userId === callerId` | `Memory: User B is refused on User A record` |
| POST | `/api/v1/me/memories/:id/reactivate` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `memory.userId === callerId` | `Memory: User B is refused on User A record` |
| **Recovery** | | | | | | |
| GET | `/api/v1/me/recovery` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Filters `snapshot.userId === callerId` | `Recovery: unauthenticated request is refused with 401` |
| POST | `/api/v1/me/recovery` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Associated to caller `userId`, checks journey owner | `Recovery: User B is refused on User A journey` |
| **SupportPlan** | | | | | | |
| POST | `/api/v1/support-plans` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Associated to caller `userId`, checks journey owner | `SupportPlan: unauthenticated request is refused with 401` |
| GET | `/api/v1/me/support-plan` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `SupportPlan: unauthenticated request is refused with 401` |
| PUT | `/api/v1/me/support-plan` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId`, checks journey owner | `SupportPlan: User B is refused on User A journey` |
| **StableSelf** | | | | | | |
| GET | `/api/v1/me/stable-self` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `StableSelf: unauthenticated request is refused with 401` |
| PUT | `/api/v1/me/stable-self` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` | `StableSelf: unauthenticated request is refused with 401` |
| **RealityHandoff** | | | | | | |
| POST | `/api/v1/handoffs` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Associated to caller `userId`, checks journey owner | `RealityHandoff: unauthenticated request is refused with 401` |
| POST | `/api/v1/handoffs/:id/share` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `handoff.userId === callerId` | `RealityHandoff: User B is refused on User A record` |
| GET | `/api/v1/handoffs` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Filters `handoff.userId === callerId` | `RealityHandoff: unauthenticated request is refused with 401` |
| **TrustedContact** | | | | | | |
| POST | `/api/v1/trusted-contacts` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Associated to caller `userId` | `TrustedContact: unauthenticated request is refused with 401` |
| GET | `/api/v1/trusted-contacts` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Filters `contact.userId === callerId` | `TrustedContact: unauthenticated request is refused with 401` |
| **Decision** | | | | | | |
| POST | `/api/v1/decisions` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Associated to caller `userId`, checks journey owner | `Decision: unauthenticated request is refused with 401` |
| GET | `/api/v1/decisions` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Filters `decision.userId === callerId` | `Decision: unauthenticated request is refused with 401` |
| PATCH | `/api/v1/decisions/:id` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `decision.userId === callerId` | `Decision: User B is refused on User A record` |
| **Cooldown** | | | | | | |
| POST | `/api/v1/cooldowns` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Associated to caller `userId`, checks decision owner | `Cooldown: unauthenticated request is refused with 401` |
| GET | `/api/v1/cooldown` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Filters `cooldown.userId === callerId` | `Cooldown: unauthenticated request is refused with 401` |
| **FutureSelf** | | | | | | |
| POST | `/api/v1/future-messages` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Associated to caller `userId`, checks context owner | `FutureSelf: unauthenticated request is refused with 401` |
| GET | `/api/v1/future-messages` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Filters `message.userId === callerId` | `FutureSelf: unauthenticated request is refused with 401` |
| **Journey & Archive** | | | | | | |
| GET | `/api/v1/journeys` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Filters `journey.userId === callerId` | `Journey: unauthenticated request is refused with 401` |
| POST | `/api/v1/journeys` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Associated to caller `userId` | `Journey: unauthenticated request is refused with 401` |
| GET | `/api/v1/journeys/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| GET | `/api/v1/journeys/:id/fingerprint` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| PATCH | `/api/v1/journeys/:id/intent` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| PATCH | `/api/v1/journeys/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| PATCH | `/api/v1/journeys/:id/situation` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| POST | `/api/v1/journeys/:id/snapshots` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| POST | `/api/v1/journeys/:id/situation/reanalyze` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| POST | `/api/v1/journeys/:id/safety/acknowledge` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| POST | `/api/v1/journeys/:id/updates` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| POST | `/api/v1/journeys/:id/action-plan` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| POST | `/api/v1/journeys/:id/actions` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| GET | `/api/v1/journeys/:id/actions` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| GET | `/api/v1/journeys/:id/timeline` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| PATCH | `/api/v1/journeys/:id/status` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| POST | `/api/v1/journeys/:id/graduate` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| POST | `/api/v1/journeys/:id/graduation-consent` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `journey.userId === callerId` | `Journey: User B is refused on User A record` |
| POST | `/api/v1/actions/:id/checkin` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `action.userId === callerId` | `Journey: User B is refused on User A action checkin` |
| POST | `/api/v1/actions/:id/checkins` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `action.userId === callerId` | `Journey: User B is refused on User A action checkin` |
| POST | `/api/v1/actions/:id/adaptive-plan` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `action.userId === callerId` | `Journey: User B is refused on User A action adaptive plan` |
| POST | `/api/v1/actions/:id/adapt` | `x-goodnight-user-id` | `user_demo` (hardcoded) | Refused 401 | Requires `action.userId === callerId` | `Journey: User B is refused on User A action adapt` |
| GET | `/api/v1/archive/journeys` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Filters `journey.userId === callerId` | `JourneyArchive: unauthenticated request is refused with 401` |
| GET | `/api/v1/archive/journeys/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `JourneyArchive: User B is refused on User A record` |
| POST | `/api/v1/archive/journeys/:id/export` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `JourneyArchive: User B is refused on User A record` |
| POST | `/api/v1/archive/journeys/:id/restore` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `JourneyArchive: User B is refused on User A record` |
| DELETE | `/api/v1/archive/journeys/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `JourneyArchive: User B is refused on User A record` |
| **Peer Support** | | | | | | |
| GET | `/api/v1/peers` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to caller `userId` and participant matches | `Peer: unauthenticated request is refused with 401` |
| POST | `/api/v1/peer-experiences` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Associated to caller `userId`, checks journey owner | `Peer: unauthenticated request is refused with 401` |
| POST | `/api/v1/journeys/:id/peer-matches` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `Peer: User B is refused on User A journey matches` |
| GET | `/api/v1/journeys/:id/peers` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `journey.userId === callerId` | `Peer: User B is refused on User A journey peers` |
| PATCH | `/api/v1/peer-matches/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires caller to be participant (match owner or experience owner) | `Peer: User C is refused on match between A and B` |
| POST | `/api/v1/peer-matches/:id/respond` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires caller to be target of match request | `Peer: User C is refused on match between A and B` |
| POST | `/api/v1/peer-matches/:id/consent` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires caller to be participant in match | `Peer: User C is refused on match between A and B` |
| GET | `/api/v1/peer-requests` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped to incoming requests for caller `userId` | `Peer: unauthenticated request is refused with 401` |
| PATCH | `/api/v1/peer-experiences/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires `experience.userId === callerId` | `Peer: User B is refused on User A experience edit` |
| GET | `/api/v1/peer-experiences/:id` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Scoped read (published or caller's own) | `Peer: unauthenticated request is refused with 401` |
| GET | `/api/v1/peer-conversations` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Filters conversations where caller is participant | `Peer: unauthenticated request is refused with 401` |
| POST | `/api/v1/peer-conversations/:matchId/messages` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires caller to be participant in conversation | `Peer: User C cannot send messages in conversation between A and B` |
| POST | `/api/v1/peer-conversations/:matchId/assist` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires caller to be participant in conversation | `Peer: User C is refused on conversation assist` |
| POST | `/api/v1/peer-conversations/:matchId/close` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires caller to be participant in conversation | `Peer: User C is refused on conversation close` |
| POST | `/api/v1/peer-conversations/:matchId/report` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires caller to be participant in conversation | `Peer: User C is refused on conversation report` |
| POST | `/api/v1/peer-conversations/:matchId/block` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires caller to be participant in conversation | `Peer: User C is refused on conversation block` |
| POST | `/api/v1/peer-conversations/:matchId/feedback` | `x-goodnight-user-id` | `user_demo` | Refused 401 | Requires caller to be participant in conversation | `Peer: User C is refused on conversation feedback` |
| **Admin Sensitive Reads** | | | | | | |
| GET | `/api/admin/v1/support/plans` | `Authorization: Bearer <token>` | None (admin guard) | Refused 401 | Admin auth required; returns metadata only, no plan JSON | `AdminSensitive: normal user or missing token refused with 401` |
| GET | `/api/admin/v1/support/plans/:id` | `Authorization: Bearer <token>` | None (admin guard) | Refused 401 | Admin auth required; persists audit log before returning content | `AdminSensitive: normal user or missing token refused with 401` |
| GET | `/api/admin/v1/memory` | `Authorization: Bearer <token>` | None (admin guard) | Refused 401 | Admin auth required; returns metadata only, no memory content | `AdminSensitive: normal user or missing token refused with 401` |
