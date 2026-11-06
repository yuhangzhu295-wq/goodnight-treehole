# DISASTER RECOVERY

How to rebuild this project from scratch on a fresh Windows machine using only GitHub,
a private `.env`, Docker, Node and the Android SDK.

Every command in this document was executed on 2026-09-29 during the recovery; none of
it is theoretical. Where a step depends on a choice made for this particular machine
(port remapping, the WSL Docker engine) that is called out, with the plain path noted
alongside it.

## 0. What you need

| Requirement | Version used | Notes |
| --- | --- | --- |
| git | 2.53+ | |
| Node.js | 24.14.0 | the recovery ran on 24; Node 20 LTS also satisfies the toolchain |
| pnpm | 9.15.0 | resolved automatically from `packageManager` in `package.json` |
| Docker | Engine 29.1.3 + Compose 2.40.3 | Docker Desktop or a Docker engine inside WSL2 both work |
| PostgreSQL client | 18 | only the CLI is needed, for `psql`, `pg_dump`, `pg_restore` |
| JDK | 21 (Temurin 21.0.12.1) | Capacitor 8 compiles against Java 21; a JDK 17 toolchain will not work |
| Android SDK | platforms 34/35/36, build-tools 36.1.0 | plus an AVD for emulator verification |

## 1. Clone and check out the right branch

```bash
git clone https://github.com/yuhangzhu295-wq/goodnight-treehole.git
cd goodnight-treehole
git fetch --all --tags --prune
git branch -a
```

`main` only carries stage 1 and stage 2. The complete product is on
`codex/third-stage-self-system` (last known good `17a7ee1933ee75c3cf547738bfbe0b2b09fec05e`,
"fix: harden DAPI persistence and peer privacy"). Recovery work happens on
`recovery/full-rebuild`, which was branched from it.

```bash
git switch -c recovery/full-rebuild origin/codex/third-stage-self-system
git rev-parse HEAD   # expect 17a7ee1933ee75c3cf547738bfbe0b2b09fec05e
```

If a `recovery-baseline-*` tag exists, checking that out is the fastest way to a known
good state:

```bash
git tag -l 'recovery-baseline-*'
git switch -c recovery/from-tag recovery-baseline-YYYYMMDD
```

Never start from `main`, and never `git reset --hard` or force push.

## 2. Install dependencies

```bash
corepack pnpm -v                 # should print 9.15.0, taken from package.json
pnpm install --frozen-lockfile
```

If `pnpm -v` prints something other than 9.15.0, the global pnpm is too old to honour
`packageManager`; use `corepack pnpm` for every command instead. Do not delete
`pnpm-lock.yaml` and do not run `pnpm update`.

`corepack enable` needs write access to the Node installation directory and will fail
without administrator rights. That is fine - modern pnpm reads `packageManager` itself.

### If the Prisma client is missing

On a machine whose pnpm store is already warm, pnpm skips `@prisma/client`'s postinstall
because its side effects are cached. That postinstall is what creates the root
`node_modules/.prisma`, and without it the API dies at boot with:

```
SyntaxError: The requested module '@prisma/client' does not provide an export named 'Prisma'
```

Running `prisma generate` does not fix it - that writes to the pnpm virtual store only.
Force the postinstall instead:

```bash
pnpm rebuild @prisma/client
ls node_modules/.prisma   # must now exist
```

This was hit and fixed during the 2026-09-29 clean-room test, on a fresh clone whose store
was already populated.

## 3. Configuration

```powershell
Copy-Item .env.example .env
```

`.env` is gitignored. See `docs/private-env-backup-guide.md` for where to keep the copy
and which values are genuinely secret. The important points:

- Point `DATABASE_URL`, `REDIS_URL` and `MINIO_ENDPOINT` at wherever the containers
  publish. With the plain `docker-compose.yml` that is 5432 / 6379 / 9000.
- Set `TEST_PG_PORT` to the PostgreSQL port; the test harness shells out to `psql` and
  otherwise assumes 5432.
- Generate `JWT_SECRET` fresh:
  `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- The API does **not** load `.env` by itself. Either run it through
  `node scripts/recovery/with-env.mjs ...`, or export the variables in the environment.
- Keep `AI_LOCAL_MODEL_ENABLED`, `OLLAMA_ENABLED` and `AI_ALLOW_OLLAMA_FALLBACK` at
  `false`. The remote DAPI is the only AI runtime; local inference is disabled in code.

## 4. Start PostgreSQL, Redis and MinIO

The straightforward path, with Docker Desktop:

```bash
docker compose up -d postgres redis minio
```

On a machine without Docker Desktop but with a Docker engine inside WSL2 (this is what
the recovery used), the project's own compose file still works; the override only
remaps the published ports so they do not collide with the native Windows services:

```bash
docker compose -f docker-compose.yml -f docker-compose.recovery.yml up -d postgres redis minio
```

That publishes PostgreSQL on 15432, Redis on 16379 and MinIO on 19000/19001. Match those
in `.env`. Then:

```bash
node scripts/recovery/ensure-infra.mjs
```

`ensure-infra.mjs` starts the WSL distro, starts the containers, and waits until Windows
can reach all three ports. It also starts a keepalive process inside the distro, because
WSL2 otherwise shuts the VM down about a minute after the last WSL command and takes the
containers with it (`vmIdleTimeout` in `%USERPROFILE%\.wslconfig` was tried and had no
effect on WSL 2.6.3).

Verify the three services before continuing:

```bash
psql -h 127.0.0.1 -p 15432 -U goodnight -d goodnight_treehole -c "select 1;"
redis-cli -p 16379 ping            # PONG
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:19000/minio/health/live   # 200
```

MinIO is declared in compose but the API never uses it: uploads go to the local
`data/uploads` directory. There is no bucket-initialisation code to run.

## 5. Database

```bash
pnpm exec prisma generate --schema prisma/schema.prisma
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
pnpm db:seed
```

`migrate deploy` applies all 9 migrations to an empty database and is the correct command
for a fresh machine. Do not use `db push` in place of migrations.

`pnpm db:seed` exits 0 but `prisma/seed.ts` is a two-line stub - the real seed data
(including the `admin` / `admin123` admin account) is written by `StoreService` when the
API first boots. So run the API at least once before expecting the admin login to work.

Confirm the schema landed:

```bash
psql -h 127.0.0.1 -p 15432 -U goodnight -d goodnight_treehole \
  -tAc "select count(*) from information_schema.tables where table_schema='public';"
# expect 52
```

## 6. Run the applications

```bash
node scripts/recovery/with-env.mjs pnpm dev:api      # API on 3000
node scripts/recovery/with-env.mjs pnpm dev:h5       # front on 5173
node scripts/recovery/with-env.mjs pnpm dev:admin    # admin on 5174
```

Or start all three detached, which survives the shell that launched them:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/recovery/start-services.ps1
powershell -ExecutionPolicy Bypass -File scripts/recovery/start-services.ps1 -Stop
```

| Surface | URL | Credentials |
| --- | --- | --- |
| API health | `http://localhost:3000/api/health` | - |
| API docs JSON | `http://localhost:3000/docs` | - |
| Front | `http://localhost:5173/pages/tonight/index` | anonymous |
| Admin | `http://localhost:5174/login` | `admin` / `admin123` |

Both Vite dev servers proxy `/api` to `127.0.0.1:3000`, so the web surfaces need no
environment configuration.

## 7. Prove it works

```bash
node scripts/recovery/with-env.mjs node scripts/recovery/smoke-front-api-db-admin.mjs
```

This drives a real browser through the front end, reads the row back from PostgreSQL,
reloads the page, and has the admin console read the same data. Exit code 0 means all
four layers agree.

## 8. AI (DAPI)

The primary provider is the remote DeepSeek endpoint. `DAPI_API_KEY` is resolved as
`DAPI_API_KEY ?? AI_PRIMARY_API_KEY ?? DEEPSEEK_API_KEY`, so the key may live in `.env`
or in the Windows user environment.

```bash
node scripts/recovery/with-env.mjs pnpm test:dapi-live
```

Success looks like `status succeeded` with `fallbackUsed=false`. A `402` in the job's
`errorMessage` means the key is valid and reachable but the account has no credit:

```bash
curl -s https://api.deepseek.com/user/balance -H "Authorization: Bearer $DEEPSEEK_API_KEY"
# {"is_available":false,...} means top up before expecting real AI output
```

Local Ollama is never a fallback. Do not re-enable it.

## 9. Android

One-time toolchain setup:

```powershell
# JDK 21 (Capacitor 8 needs it; a JDK 17 toolchain fails)
curl.exe -L -o "$env:USERPROFILE\Tools\jdk21.zip" `
  "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/21/jdk/x64/windows/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip"
# extract, then point JAVA_HOME at the extracted jdk-21.0.12.1+1 directory
```

`apps/mp/android/local.properties` must point at the SDK:

```
sdk.dir=C\:\\Users\\<you>\\AppData\\Local\\Android\\Sdk
```

Build and install:

```bash
pnpm --filter @goodnight/mp build:native-debug
pnpm --filter @goodnight/mp exec cap sync android
cd apps/mp/android && JAVA_HOME='C:\Users\<you>\Tools\jdk-21.0.12.1+1' cmd //c "gradlew.bat assembleDebug"
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

The debug bundle calls the API at `http://127.0.0.1:3000`, which requires a reverse
tunnel to the host:

```bash
adb reverse tcp:3000 tcp:3000
```

That works for both the emulator and a USB device, which is why it is preferred over the
emulator-only `10.0.2.2`. Cleartext HTTP is allowed only in the debug build, through
`apps/mp/android/app/src/debug/AndroidManifest.xml`; the release build stays HTTPS-only.

iOS needs macOS and Xcode. On Windows the iOS project can only be generated and synced
(`pnpm --filter @goodnight/mp exec cap sync ios`), never built or run.

## 10. Back up

```powershell
powershell -ExecutionPolicy Bypass -File scripts/backup-all.ps1
```

Writes a `git bundle` of all refs, a bare mirror, a `pg_dump` archive, and a zip of the
recovery evidence, then verifies each. `backup-code.ps1` fails loudly if any commit is
unpushed, and treats an unreachable remote as a warning rather than an abort, since the
bundle is built from local refs and this is exactly when a backup matters most. Backups
default to `D:\Backups` and fall back to `%USERPROFILE%\Backups` when `D:` is not mounted.

The evidence zip matters because `artifacts/` is gitignored: the screenshots and manifests
the recovery documents cite are in neither the repository nor the code bundle, and the
emulator session cannot be reproduced without the device. Service logs are excluded, since
`start-services.ps1` keeps them open while the dev servers run.

End every working session with at least: `git commit`, `git push`, `backup-all.ps1`.

## 11. Rules that keep this from happening again

- The project lives in a real directory (`C:\Users\<you>\Projects\goodnight-treehole`),
  never in a temporary or agent scratch directory.
- Commit and push at each checkpoint; a day of unpushed work is a day at risk.
- Never commit `.env`. Keep the private copy described in
  `docs/private-env-backup-guide.md`.
- Never delete a local database volume without taking a `pg_dump` first.

## 12. This document was tested

The procedure above was replayed end to end on 2026-09-29 in a separate directory,
`C:\Users\zyu33\Projects\recovery-cleanroom`, using only the recovery tag:

```bash
git clone --branch recovery-baseline-20260929 <repo> recovery-cleanroom   # 674 tracked files
# separate database: goodnight_treehole_cleanroom
pnpm install --frozen-lockfile      # exit 0, lockfile unchanged
pnpm exec prisma generate
pnpm rebuild @prisma/client         # see section 2
pnpm exec prisma migrate deploy     # 9 migrations, 52 tables
node scripts/recovery/with-env.mjs pnpm dev:api   # API_PORT=3100
curl http://127.0.0.1:3100/api/health             # 200
curl -X POST http://127.0.0.1:3100/api/v1/journeys -H 'content-type: application/json' \
  -d '{"domain":"其他","relationScene":"","content":"CLEANROOM-20260929"}'
# -> journey_279f52c345, read back from the clean-room database
```

So the clone, install, configuration, migration and API steps here are known to work from
the tag alone, not just on the machine they were written on. The one gap the replay found
is the Prisma postinstall issue in section 2, which is now part of the procedure.
