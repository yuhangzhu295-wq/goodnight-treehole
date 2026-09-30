# Post-Recovery Validation Baseline

Environment snapshot taken at the start of the post-recovery product verification on
2026-09-30, before any change was made. Secret values are deliberately not recorded.

## 1. Git

| Item | Value |
| --- | --- |
| Validation branch | `codex/post-recovery-validation` |
| Branch base / current SHA | `461d6359548f74e52fed5691e81b833635976896` |
| `recovery/full-rebuild` | `461d6359548f74e52fed5691e81b833635976896` (untouched, in sync with origin) |
| `recovery-baseline-20260929` tag | `60627c6397510d57b290ac7fc1142667fb3a2361` -> commit `d5f2ddb98d8ba25a6b5e580f48ef4b4fcfe268b0` (untouched, present on origin) |
| Worktree at start | clean |

The recovery branch and the recovery tag are treated as read-only for this whole task. No
force push, no tag rewrite, no deletion.

## 2. Toolchain

| Component | Value |
| --- | --- |
| Node.js | v24.14.0 |
| pnpm | 9.15.0 |
| Docker Engine | 29.1.3 (inside WSL2 Ubuntu) |
| Docker Compose | 2.40.3 |
| JDK for Android builds | Temurin 21.0.12.1 |

## 3. Infrastructure

| Service | Version | Endpoint | Status |
| --- | --- | --- | --- |
| PostgreSQL | 16.15 (container `postgres:16-alpine`) | 127.0.0.1:15432 | up 23 h |
| Redis | 7.4.8 (container `redis:7-alpine`) | 127.0.0.1:16379 | up 23 h |
| MinIO | container `minio/minio:latest` | 127.0.0.1:19000 / 19001 | health 200 |

Prisma migrations applied: **9**.

## 4. Applications

| Surface | Endpoint | Status |
| --- | --- | --- |
| API health | http://127.0.0.1:3000/api/health | 200 |
| Front | http://127.0.0.1:5173/pages/tonight/index | 200 |
| Admin | http://127.0.0.1:5174/login | 200 |

## 5. Android

| Item | Value |
| --- | --- |
| SDK | `C:\Users\zyu33\AppData\Local\Android\Sdk` |
| Platforms | android-34, android-35, android-36 |
| adb | 1.0.41 |
| AVD | `GoodnightPixel7Api34` (Pixel 7, API 34) |
| Devices attached | 1 - the emulator only, **no physical device** |
| Installed APK | 39,758,945 bytes, sha256 `4b4f65ad74c945e0...` |

`PHYSICAL_ANDROID_VERIFIED=false`, reason `NO_PHYSICAL_ANDROID_CONNECTED`. An emulator is
never reported as a physical device.

## 6. AI configuration

Presence only; no values are recorded.

| Variable | State |
| --- | --- |
| `DAPI_BASE_URL` | `https://api.deepseek.com` |
| `DAPI_MODEL` | `deepseek-chat` |
| `DAPI_API_KEY` | empty in `.env` |
| `DEEPSEEK_API_KEY` | present in the Windows user environment; the API resolves the primary key as `DAPI_API_KEY ?? AI_PRIMARY_API_KEY ?? DEEPSEEK_API_KEY` |
| `AI_LOCAL_MODEL_ENABLED` | `false` |
| `OLLAMA_ENABLED` | `false` |
| `AI_ALLOW_OLLAMA_FALLBACK` | `false` |

## 7. First gate result

`pnpm test:dapi-live` **failed**, and not because of anything in this repository:

```
balance endpoint   -> 200   (key valid, host reachable)
chat completions   -> 402   {"error":{"message":"Insufficient Balance ..."}}
job record         -> provider_dapi_deepseek attempted,
                      errorMessage "provider_dapi_deepseek:Remote provider returned HTTP 402.",
                      fell back to provider_safe_template, fallbackUsed=true
```

Per the task rules this is classified as:

```
DAPI_RESTORED=false
issue type: EXTERNAL_BLOCKER
name:       BLOCKED_DAPI_BALANCE
```

No workaround was attempted and none will be: no code change, no local model, no stub, no
mock, no Ollama, no automatic downgrade to make the test pass.

## 8. What this gates

The task requires DAPI to be restored before entering the Android second-stage flow, and
`STAGE2_VERIFIED` / `STAGE3_BUSINESS_VERIFIED` / `QA_ALL_PASS` all depend on real funded
remote AI output. Those are therefore not reachable while the account has no balance, and
none of them will be reported as true.

Everything that does not depend on DAPI - the fresh failure set, the test contract
adjudication, and the Android coverage, keyboard, back, lifecycle and network checks - is
still in scope and is carried out below.
