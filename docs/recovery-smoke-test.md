# Recovery Smoke Test - Front UI -> API -> PostgreSQL -> Reload -> Admin

Run 2026-09-29 13:33 (+08:00) on the restored environment. Reproduce with:

```bash
node scripts/recovery/ensure-infra.mjs
node scripts/recovery/with-env.mjs node scripts/recovery/smoke-front-api-db-admin.mjs
```

The script drives a real Chromium through the real Vite dev servers, reads the row back
from PostgreSQL, reloads the front to prove persistence, and finally has the admin console
read the same data through its own authenticated API. It exits non-zero if any layer
fails and writes `artifacts/recovery/smoke-result.json` plus screenshots.

## Verdict

`=== smoke PASS (0 failure(s)) ===`

## Layer-by-layer evidence

### 1. Front UI creates the Journey

- URL: `http://127.0.0.1:5173/pages/tonight/index`
- Filled `[data-testid="tonight-input"]` and clicked `[data-testid="tonight-continue"]`.
- Screenshot: `artifacts/recovery/smoke-01-tonight.png`
- The page rendered the real product shell: hero "今晚怎么了？", the entry card, the six
  shortcuts, the quiet-note card and the four bottom tabs 今晚 / 同路 / 行动 / 我的.

### 2. API received the real POST

- `POST /api/v1/journeys` -> **HTTP 201**
- Response contained `journey.id = journey_8b153b2369` and `job.id = job_3d8d36b9d5`.

### 3. PostgreSQL holds the row

```
select id || '|' || coalesce(title,'') || '|' || coalesce("userId",'')
from "LifeJourney" where id = 'journey_8b153b2369';

journey_8b153b2369|其他里正在整理的一件事|user_demo
```

`select count(*) from "LifeJourney"` returned `1` - the table was empty before the run, so
this row is genuinely the one the browser created.

### 4. Front reload keeps it

Reopened `http://127.0.0.1:5173/pages/journey/detail?id=journey_8b153b2369` in a fresh
navigation. The exact marker text typed in step 1
(`RECOVERY-SMOKE-20260929053355 ...`) is present in the rendered page, so the data came
back from the API and database rather than from in-page state.

Screenshot: `artifacts/recovery/smoke-02-journey-detail.png`, `smoke-03-after-reload.png`.
The detail page shows the situation-confirmation screen with the person's own words under
"发生了什么", plus AI-derived content under "现在" and an empty "影响" slot.

### 5. Admin reads the same data

- Logged in at `http://127.0.0.1:5174/login` with `admin` / `admin123` through the real
  form (`admin-login-username`, `admin-login-password`, `admin-login-submit`).
- Landed on `/dashboard`; screenshot `smoke-04-admin-login.png`, `smoke-05-admin-dashboard.png`.
- The dashboard's own authenticated call to `/api/admin/v1/dashboard/overview` returned
  HTTP 200 with:

```json
{ "total": 1, "active": 1, "actions": 0, "dueCheckins": 0, "peerExperiences": 0,
  "safetyEvents": 0, "supportPlans": 0, "followUps": 0, "unreadNotifications": 0,
  "peerRequests": 0, "connectedPeerConversations": 0, "recoveryRecords": 0 }
```

- `total` equals the PostgreSQL count exactly (`1 == 1`), and the dashboard renders the
  "进行中旅程" tile from that same payload.

## AI job observed during the run

The Journey creation also enqueued a real `situation_analysis` job. Its persisted row:

| Column | Value |
| --- | --- |
| `id` | `job_3d8d36b9d5` |
| `taskType` | `situation_analysis` |
| `providerId` | `provider_safe_template` |
| `modelName` | `safe-response-template` |
| `status` | `fallback` |
| `fallbackUsed` | `t` |
| `durationMs` | 576 |
| `errorMessage` | `provider_dapi_deepseek:Remote provider returned HTTP 402.` |

This is the honest result: the pipeline tried the real remote DAPI provider first and only
fell back because the DeepSeek account has no balance. Confirmed independently of the
application:

```
GET  https://api.deepseek.com/user/balance -> 200 {"is_available":false,"balance_infos":[{"currency":"CNY","total_balance":"-0.01",...}]}
POST https://api.deepseek.com/chat/completions -> 402 {"error":{"message":"Insufficient Balance ..."}}
```

So the AI routing, job persistence, provider/model recording and fallback path are all
working; only funded remote inference is unavailable, which the account owner must fix.
`fallbackUsed = false` is therefore **not** achieved, and DAPI is not claimed as restored.

## What this does and does not prove

Proves: the restored front, API, database, migrations, admin console, admin auth, AI job
pipeline and cross-end data sharing all work on this machine with real data.

Does not prove: stage 1/2/3 business suites, `qa:all`, funded remote AI output, or anything
about the native Android/iOS shells. Those are covered separately.
