# Disaster Recovery Baseline

Recorded at the start of the recovery on 2026-09-29 (Asia/Shanghai) by the ZCode
recovery session. Everything below was observed on this machine, not copied from an
earlier report.

## 1. Source of truth

| Item | Value |
| --- | --- |
| Repository | `https://github.com/yuhangzhu295-wq/goodnight-treehole` |
| Source branch | `codex/third-stage-self-system` |
| Source HEAD (verified) | `17a7ee1933ee75c3cf547738bfbe0b2b09fec05e` |
| Source HEAD subject | `fix: harden DAPI persistence and peer privacy` |
| Source HEAD author date | 2026-08-31 22:32:02 +0800 |
| Commits on source branch | 19 |
| `origin/main` | `99c84de678abf1bc5359b5d360699ce7dbb6d383` |
| `origin/codex/second-stage-peer-final` | `8ebcfaea644516daf7eb318632df225477223a6c` |
| Tags on remote | none |
| Recovery branch | `recovery/full-rebuild` @ `17a7ee1933ee75c3cf547738bfbe0b2b09fec05e` |
| Clone time | 2026-09-29 13:04 (+08:00) |

Verification performed, in order:

1. `git ls-remote --heads` against the remote.
2. `git init` + `git remote add origin` + `git fetch --all --tags --prune`.
3. `git rev-parse origin/codex/third-stage-self-system`.

The remote SHA matches the SHA stated in the recovery brief exactly, and no newer
commit exists on that branch. `origin/main` is an ancestor of the third-stage branch,
so the third-stage branch contains all of stage 1 and stage 2 history.

Working tree immediately after branch creation: clean (`git status --short` empty).

## 2. Local paths

| Item | Path |
| --- | --- |
| Official project directory | `C:\Users\zyu33\Projects\goodnight-treehole` |
| Local-only artifacts written during recovery | `artifacts/recovery/` (gitignored) |
| Local `.env` | `C:\Users\zyu33\Projects\goodnight-treehole\.env` (gitignored) |

The brief asked for `D:\Projects\goodnight-treehole`. `D:` is not available on this
machine: during the session it disappeared from the mount table while in use, and
`Get-PSDrive` now reports only `C:` and `V:`. The volume behaved like a removable
SanDisk device (it contained `Install SanDisk Software.exe`, a `PrivateAccess Vault`
directory and a 1.9 GB `V:` recovery partition). Because the brief's own fallback
rule applies when `D:` is absent, the project lives on `C:` instead. This also means
`D:\Backups\...` from the backup section of the brief cannot be used as-is; see
`docs/DISASTER_RECOVERY.md` for where backups actually go.

## 3. Toolchain observed

| Tool | Version | Note |
| --- | --- | --- |
| git | 2.53.0.windows.1 | |
| Node.js | v24.14.0 | already installed; no version manager present |
| npm | 11.9.0 | |
| corepack | 0.34.6 | |
| pnpm | 9.15.0 | resolved from `packageManager` in `package.json` |
| gh | 2.93.0 | authenticated as `yuhangzhu295-wq` |
| Docker Engine | 29.1.3 | inside WSL2 Ubuntu, **not** Docker Desktop |
| Docker Compose | 2.40.3 | |
| WSL | 2.6.3.0, kernel 6.6.87.2-1 | distro `Ubuntu` 24.04.4 |
| PostgreSQL client | 18.3 | native install, used as the CLI only |
| Java / adb / Android SDK | see `docs/android-rebuild-environment.md` | |

The brief recommends Node 20 LTS. Node 24 was already installed and no version manager
is present, so the recovery proceeded on Node 24. `pnpm install --frozen-lockfile`,
`prisma generate`, `prisma migrate deploy`, `tsc`, `vue-tsc`, `vitest` and `vite` were
all exercised on it; see `docs/disaster-recovery-final.md` for the results.

## 4. Infrastructure decisions

Docker Desktop is **not installed** and the account has **no administrator rights**
(`net session` and the WindowsPrincipal administrator check both fail), so Docker
Desktop cannot be installed and the Windows-native PostgreSQL/Redis services cannot be
stopped or reconfigured. WSL2 already had a working Docker Engine, so the project's own
`docker-compose.yml` runs there.

Two native Windows services occupy the compose defaults:

| Port | Owner | Usable by this project? |
| --- | --- | --- |
| 127.0.0.1:5432 | native PostgreSQL 18.3 | no — neither `postgres` nor `goodnight` role exists, and the superuser password is unknown |
| 127.0.0.1:6379 | native Redis 3.0.504 | no — too old for BullMQ (needs >= 5) |

Both were left running and untouched. WSL2 localhost forwarding cannot bind a port a
native Windows process already owns, so the containers publish remapped ports through
`docker-compose.recovery.yml` (an additive override; `docker-compose.yml` is unmodified):

| Service | Compose default | Recovery port | Observed version |
| --- | --- | --- | --- |
| postgres | 5432 | 15432 | PostgreSQL 16.15 (postgres:16-alpine) |
| redis | 6379 | 16379 | Redis 7.4.8 (redis:7-alpine) |
| minio | 9000 / 9001 | 19000 / 19001 | RELEASE.2025-09-07T16-13-09Z |

Remapping rather than using the WSL IP keeps `localhost` in every connection string, so
nothing depends on the WSL address, which changes on each VM restart.

MinIO image pin: `docker-compose.yml` pins `minio/minio:RELEASE.2026-06-13T11-33-47Z`.
This network cannot reach `registry-1.docker.io` or `hub.docker.com` at all, and the
only reachable mirror (`docker.1panel.live`) answers 403 for that tag. The mirror's
`latest` resolves to `RELEASE.2025-09-07T16-13-09Z`, which is older than the pinned tag,
so the mirror is stale rather than the pin being wrong. `latest` is used in the override
and the pin in `docker-compose.yml` is left untouched.

### WSL idle shutdown

WSL2 terminated the VM roughly a minute after the last WSL command, which stopped the
containers and made the database unreachable mid-run. `vmIdleTimeout` in
`%USERPROFILE%\.wslconfig` was set to 24 hours and **tested to have no effect** on WSL
2.6.3. A detached `sleep` process inside the distro does hold the VM open (verified over
a 120 s idle window), and `scripts/recovery/ensure-infra.mjs` starts that keepalive,
brings the compose services up, and waits until Windows can reach all three ports.

## 5. Configuration

`.env` was created from `.env.example` (commit `17a7ee19`) and is gitignored. Changes
from the template, all forced by the environment above:

- `DATABASE_URL` -> port 15432, `REDIS_URL` -> port 16379, `MINIO_ENDPOINT` -> port 19000.
- `TEST_PG_PORT=15432`, because `scripts/test-database.ts` shells out to `psql` and
  otherwise defaults to the unusable native server on 5432.
- `JWT_SECRET` regenerated as a fresh 48-byte random value. The API never reads it, but
  a strong local value is required by the brief and it is not a recoverable secret.
- `AI_SECONDARY_*` left empty. The brief instructs that GPT and Claude models are not to
  be used, and the code falls back to `OPENAI_API_KEY` for the secondary provider, so the
  secondary provider is deliberately left unconfigured.
- `DAPI_API_KEY` left empty in the file. The real DeepSeek key survives in the Windows
  user environment as `DEEPSEEK_API_KEY`, and `remote-ai-provider.service.ts` resolves the
  primary key as `DAPI_API_KEY ?? AI_PRIMARY_API_KEY ?? DEEPSEEK_API_KEY`. No secret was
  written into any file or report.

`AI_LOCAL_MODEL_ENABLED`, `OLLAMA_ENABLED` and `AI_ALLOW_OLLAMA_FALLBACK` remain `false`,
as required. `apps/api/src/runtime-environment.ts` hard-codes `localInferenceAllowed =
false` and `apps/api/src/remote-ai-provider.service.ts` rejects non-HTTPS and local
provider endpoints, so the remote-DAPI-only policy is enforced in code, not just config.

### How configuration reaches the API

The repository has no dotenv loader: `git grep dotenv` is empty, there is no
`--env-file` anywhere, and `apps/api/src/main.ts` never loads a file. Prisma CLI and Vite
load `.env` themselves, which is why migrations and the two dev servers work unaided, but
the API reads `process.env` only. The original environment therefore supplied API config
through Windows user environment variables - the surviving `DEEPSEEK_API_KEY` and
`OPENAI_API_KEY` in `HKCU\Environment` are direct evidence of that pattern.

`scripts/recovery/with-env.mjs` reproduces it without leaking values into unrelated
projects: it parses `.env` and spawns the command with those values merged under the
existing environment. Node refuses `--env-file` inside `NODE_OPTIONS`, so a child-process
wrapper is the only way to do this without editing the package scripts.

## 6. Baseline state achieved

- `pnpm install --frozen-lockfile` exit 0; `pnpm-lock.yaml` byte-identical afterwards.
- `prisma generate` exit 0.
- `prisma migrate deploy` applied all 9 migrations to an empty database, exit 0.
- `pnpm db:seed` exit 0. Note `prisma/seed.ts` is a two-line stub that only prints a
  message; the real seed data is created by `StoreService` when the API boots.
- `GET /api/health` -> HTTP 200.
- Front on 5173 and admin on 5174 -> HTTP 200.
- Four-layer smoke test (front UI -> API -> PostgreSQL -> reload -> admin) passed; see
  `docs/recovery-smoke-test.md`.

## 7. Git hygiene during recovery

No `git reset --hard`, no `git clean -fdx`, no force push and no remote history rewrite
were performed. The only remote change so far is the creation of `recovery/full-rebuild`
from `origin/codex/third-stage-self-system`.
