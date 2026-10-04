# RESUME HERE

State as of the release-candidate round, written so the next session does not have to rediscover the
environment. The product status is in [`RC_STATUS.md`](RC_STATUS.md); this file is about the machine.

## Where things stand

| | |
| --- | --- |
| Branch | `codex/post-recovery-validation` |
| HEAD | `558ccc1` — in sync with `origin`, working tree clean |
| RC tag | **none** — `RELEASE_CANDIDATE_READY=false` |
| PR to `main` | **none** — gated on the RC passing |
| Last backup | `C:\Users\zyu33\Backups\backup-all-20261004-0403.json` — all four components PASS |

Everything is committed and pushed. Nothing depends on a running process.

## Starting the stack

PostgreSQL, Redis and MinIO run in WSL2 Docker, not natively:

```bash
wsl -e docker ps                 # starts the distro if it is stopped, and the containers with it
```

**WSL2 stops when idle and takes the containers with it**, so a port that worked a minute ago can be
refusing connections now. Hold it open for a working session with a long-lived process:

```bash
wsl -e sleep 86400               # in a separate terminal, or as a background task
```

Then the three dev servers, each from the repo root:

```bash
pnpm --filter @goodnight/api start
pnpm --filter @goodnight/admin dev --host 127.0.0.1 --port 5174 --strictPort
pnpm --filter @goodnight/mp dev --host 127.0.0.1 --port 5173 --strictPort
```

Ports: API 3000, mini-program 5173, admin 5174. Database `postgresql://goodnight:goodnight@127.0.0.1:15432/goodnight_treehole`.

**Run the gate in the same process tree as the servers.** When a background task ends, its children go
with it, and a `qa:all` run whose API dies mid-way reports false failures — that happened twice in the
last round (`test:click-all` showed 9 failures that were really a dead API, and it passes 124/124 when
the API stays up). One task that starts the servers, waits for readiness, runs the gate and only then
exits avoids it.

## Databases on this machine

| Database | Purpose |
| --- | --- |
| `goodnight_treehole` | the development database |
| `goodnight_shadow` | shadow database for `prisma migrate diff --from-migrations` |
| `goodnight_rc_clean` | scratch database for the empty-database migration proof; safe to drop and recreate |

Business specs create and drop their own schemas (`goodnight_treehole_test_*`) via
`scripts/test-database.ts`, which uses `prisma db push`, not migrations.

## Android

JDK 21 is required for the Gradle build (installed during the last round; Android Studio's bundled JBR
17 is not enough):

```bash
export JAVA_HOME="C:/Program Files/Eclipse Adoptium/jdk-21.0.12.101-hotspot"
adb reverse tcp:3000 tcp:3000
pnpm --filter @goodnight/mp build:native-debug
(cd apps/mp && npx cap sync android)
(cd apps/mp/android && ./gradlew.bat assembleDebug)
adb install -r apps/mp/android/app/build/outputs/apk/debug/app-debug.apk
```

Driving the native UI from a script uses the WebView DevTools protocol:

```bash
adb forward tcp:9333 localabstract:webview_devtools_remote_$(adb shell pidof com.goodnight.treehole)
ANDROID_CDP_URL=http://127.0.0.1:9333 node docs/product-closure/verification/verify-android-rc.mjs
```

## Known environment traps

- **`prisma generate` fails with EPERM** while the API is running: the process holds the query engine
  DLL open. Stop the API first.
- **`git checkout <ref> -- <paths>` wipes uncommitted work in those files.** A bisect done this way
  silently destroyed an uncommitted fix last round. Commit or stash before bisecting.
- The development database has grown to ~12.6k rows from test traffic, which is what surfaced the flush
  timeout finding in `RC_STATUS.md`. Writes are slow (measured 7–16 s) and near the transaction limit.

## What to do next

1. Fund the DeepSeek account, then re-run `pnpm test:dapi-live`, `pnpm test:cross` and `pnpm qa:all`.
2. Decide the flush fix (scope the flush to changed rows, or batch it).
3. Re-run `scripts/backup-all.ps1`, then create the RC tag and open the PR to `main`.
