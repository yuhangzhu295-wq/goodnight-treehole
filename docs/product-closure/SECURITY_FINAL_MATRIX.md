# SECURITY FINAL MATRIX

`DECORATIVE_SECURITY_CONTROL_COUNT = 0`

Every control below was re-asserted against the running stack in this round
(`work/verify-security-controls.mjs`, **20/20**), and the ones the closure round touched are called
out explicitly. A control counts as real only if it can be shown to *refuse* something.

## 1. Admin surface is closed by default

| Control | Assertion | Result |
| --- | --- | --- |
| Admin routes require a token | `GET safety/events`, `GET peer-conversations`, `GET audit-logs`, `GET users/export` with no `authorization` header | all 4 → **401** |
| Forged tokens are rejected | `Authorization: Bearer forged.token.value` | **401** |
| The new safety write route is guarded | `PATCH safety/events/:id/handle` with no token | **401** |
| Valid credentials still work | `POST /api/admin/v1/auth/login` | **201** with a token |

`AdminAuthGuard` is applied at the controller level (`@UseGuards(AdminAuthGuard)` on
`AdminController`), with only the three login/logout routes allow-listed. The closure round added
`PATCH safety/events/:id/handle` inside that guard, so the new write inherits the same protection —
verified, not assumed.

## 2. Login throttling is server-side (replacing the old decorative captcha)

| Control | Assertion | Result |
| --- | --- | --- |
| Repeated failures are throttled | 6 bad logins for one (IP, username) | 401 ×5 then **429** |
| The refusal is actionable | response body | `retryAfterSeconds=846` |
| Throttling is not bypassed by a correct password | correct password from the throttled identity | **429** |
| The old captcha is gone, not faked | `GET /login` HTML | no `admin-login-captcha` field |
| Buckets are per identity and per IP | (prior round, `work/verify-login-throttle.mjs` 7/7) | pass |

The throttle uses synthetic `x-forwarded-for` values in the test so the real operator identity is
never locked out.

## 3. Ownership and cross-user isolation

| Control | Assertion | Result |
| --- | --- | --- |
| Another user's letter is not readable | `GET /api/v1/letters/:id` as a different user | **404** |
| An unknown identity is rejected | `GET /api/v1/handoffs` as `user_attacker` | **404** |
| A real user can read their own data | `GET /api/v1/handoffs` as the owner | **200**, 10 rows |
| Peer experience details are scoped | prior round, `work/verify-fixed-issues.mjs` | 9/9 (owner 200 / other 404) |
| Handoffs are caller-scoped | prior round, same suite | 9/9 (owner 3 / other 0) |

## 4. Privacy gates actually gate

| Control | Assertion | Result |
| --- | --- | --- |
| `allowPeerMatching` off ⇒ no peer data | `GET /api/v1/peers` | **200** with `privacyEnabled=false`, `experiences=0`, `matches=0` — nothing leaks |
| …and the scoped route refuses outright | `GET /api/v1/journeys/:id/peers` with the flag off | **403** |
| The flag opens the network again | same routes with the flag on | **200**, `privacyEnabled=true` |
| Recovery-data consent gates the monthly report | prior round, `work/verify-privacy-data.mjs` | 8/8 |
| `allowAiMemoryUse` is independent of `allowLongTermMemory` | prior round, same suite | 8/8 |

## 5. Contact-detail (PII) leakage into peer requests

| Control | Assertion | Result |
| --- | --- | --- |
| Phone numbers are refused | `requestReason` containing `13800138000` | **400** |
| Email addresses are refused | `sec@example.com` | **400** |
| Home addresses are refused | `杭州市西湖区文三路` | **400** |
| WeChat ids are refused | `secwx2026` | **400** |
| National id numbers are refused | `11010519491231002X` | **400** |
| A clean reason is accepted | ordinary text | **200** |

## 6. Report handling does not leak back to the peer

The closure round added report visibility for operators. That must not become a disclosure to the
counterpart, so both directions are pinned:

| Control | Assertion | Result |
| --- | --- | --- |
| The user-facing conversation payload carries no report fields | keys of the reporter's own payload | `id, matchId, status, startsAt, consentAcceptedAt, expiresAt, createdAt, messages` — no `reportReason`, no `reporterUserId` |
| The counterpart cannot see the report either | the other participant's payload | no `reportReason` |
| The operator *can* see it | `GET /api/admin/v1/peer-conversations?reported=true` | reason, time and reporter present (see `ADMIN_FINAL_MATRIX.md`) |

## 7. Privileged writes leave an audit trail

| Control | Assertion | Result |
| --- | --- | --- |
| Handling a safety event is audited | `AuditLog.action = 'SAFETY_EVENT_HANDLE'` | 6 rows |
| The audit row is usable evidence | latest row | `adminUserId=admin_1`, `resourceType=SafetyEvent`, `resourceId=safety_defc2e668a`, `beforeJson` and `afterJson` both populated (`before.status=open` → `after.status=handled`) |
| The audit and the state change commit together | `StoreService.handleSafetyEvent` mutates in memory only; the controller writes the audit row and flushes once | by construction (`506162c`), and the persistence check in `work/verify-safety-closure.mjs` reads both back from PostgreSQL |
| Write-only settings are refused or enforced | prior round, `work/verify-settings-enforced.mjs` | 7/7 |

## 8. Security-relevant behaviour of the AI degradation path

The round made AI degradation visible. It did not weaken anything to do so:

| Property | Status |
| --- | --- |
| No local model can substitute for the real provider | `provider_qwen` is `enabled=false` with `disabled://local-model`; `OLLAMA_ENABLED=false`, `AI_LOCAL_MODEL_ENABLED=false`, `AI_ALLOW_OLLAMA_FALLBACK=false` |
| The user is told when a reply is a fallback | verified on web and on the native Android app |
| The operator can still see the provider failure per job | admin AI job table records `status=fallback`, `providerId`, `errorMessage` |
| The provider failure is not concealed as success | 117 fallback jobs remain `fallback` in the database; nothing was rewritten to look successful |
| The notice leaks no provider internals to the user | the user-facing copy names no endpoint, key or balance |

## 9. Environment-level controls

| Item | Status |
| --- | --- |
| `.env` is gitignored and never copied by the backup scripts | `scripts/backup-code.ps1` states this explicitly; `.env` is in `.gitignore` |
| No secrets in the code bundle | the bundle carries committed history only |
| `work/` (verification scripts) is gitignored | evidence lives outside version control, matching the previous round |
| Admin bootstrap credentials | `admin` / `admin123` — a local development default from `.env`; **must be changed before any non-local deployment** |

## Residual security items (recorded, not hidden)

| Item | Severity | Note |
| --- | --- | --- |
| `admin` / `admin123` default credentials | environment | acceptable for the local development stack; a deployment blocker if ever exposed |
| ISSUE-014 — 39 admin endpoints with no reachable caller | P3 | an unreachable endpoint is attack surface without product value; product decision |
| ISSUE-020 — no per-report history model | P2 | a second report on the same conversation overwrites the first, so report history is not reconstructable |
| Two pre-existing schema/DB drift items | P3 | not security-relevant; recorded for completeness |
