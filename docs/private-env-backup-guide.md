# Private Environment Backup Guide

`.env` must never be committed. `.gitignore` already excludes it (`.env`, `.env.*`,
with `!.env.example` as the only exception), and `scripts/backup-code.ps1` only ever
bundles committed git history, so the file cannot leak through the backup scripts.

That also means **the code backup does not protect `.env`**. Losing it again would mean
losing the same secrets that were lost this time. Store a copy somewhere outside this
machine's working tree.

## What is actually secret

| Variable | Secret? | Recoverable without a copy? |
| --- | --- | --- |
| `DAPI_API_KEY` | yes | Only if `DEEPSEEK_API_KEY` survives in the Windows user environment - see below |
| `AI_SECONDARY_API_KEY` | yes | Not used in this recovery (the brief disables GPT/Claude) |
| `JWT_SECRET` | yes, but local-only | Regenerate; the API never reads it |
| `ADMIN_INIT_PASSWORD` | bootstrap credential | It is `admin123` in `apps/api/src/store.service.ts` today, so it is not really secret yet |
| `DATABASE_URL`, `REDIS_URL`, `MINIO_*` | no | Rebuild from `docker-compose.yml` and this document |
| `AI_LOCAL_MODEL_ENABLED`, `OLLAMA_ENABLED`, `AI_ALLOW_OLLAMA_FALLBACK` | no | Must stay `false` |

## Where to keep the copy

Preferred, in order:

1. A password manager entry holding the full `.env` text.
2. `D:\PrivateBackups\goodnight-treehole\.env` on the external volume, if that volume is
   attached. Note that `D:` is a removable device on this machine and was absent for part
   of the 2026-09-29 recovery, so do not treat it as the only copy.
3. An encrypted archive in a second location, for example
   `%USERPROFILE%\PrivateBackups\goodnight-treehole-env-<date>.zip` created with a
   password-protected tool.

Do not put it in OneDrive, a shared folder, or any synced location that other people can
read, and do not paste it into a chat, an issue, or an AI session.

### A copy already exists

As of 2026-09-29 there is a copy at
`C:\Users\zyu33\PrivateBackups\goodnight-treehole\.env`, byte-identical to the working one
and outside the repository. It protects against losing the working directory again - the
failure that actually happened - but it is plaintext on the same disk, so it does not
protect against disk failure or theft. Prefer option 1 for that.

What it does **not** contain is worth knowing: every provider key in it is empty. The real
DeepSeek key lives only in the Windows user environment as `DEEPSEEK_API_KEY`, which this
file copy does not cover. Back that up separately - a password manager entry is the right
place, and it is the one credential that cannot be regenerated.

## Rebuilding .env from scratch

If no copy exists, this is the whole procedure:

```powershell
Copy-Item .env.example .env
```

Then edit the copy:

1. Point the endpoints at wherever the containers actually publish. On this machine that
   is `docker-compose.recovery.yml`, so the ports are `15432`, `16379` and `19000`; with a
   normal Docker Desktop setup they are `5432`, `6379` and `9000`.
2. Set `TEST_PG_PORT` to the same PostgreSQL port. `scripts/test-database.ts` shells out
   to `psql` and otherwise assumes `5432`.
3. Generate `JWT_SECRET`:
   `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
4. Supply the real DAPI key. Either put it in `DAPI_API_KEY` in `.env`, or leave the
   variable empty and keep the key in the Windows user environment as `DEEPSEEK_API_KEY` -
   `apps/api/src/remote-ai-provider.service.ts` resolves the primary key as
   `DAPI_API_KEY ?? AI_PRIMARY_API_KEY ?? DEEPSEEK_API_KEY`, so either location works.
5. Leave `AI_LOCAL_MODEL_ENABLED`, `OLLAMA_ENABLED` and `AI_ALLOW_OLLAMA_FALLBACK` as
   `false`. The project has no opt-in for local inference; `runtime-environment.ts`
   hard-codes `localInferenceAllowed = false`.

Remember that the API does not read `.env` by itself. Run it through
`node scripts/recovery/with-env.mjs pnpm dev:api`, or set the variables in the Windows
user environment the way the original setup did.

## Verifying a restored .env

```powershell
node scripts/recovery/ensure-infra.mjs
node scripts/recovery/with-env.mjs pnpm exec prisma migrate status --schema prisma/schema.prisma
node scripts/recovery/with-env.mjs node scripts/recovery/smoke-front-api-db-admin.mjs
```

If the AI section is configured, `pnpm test:dapi-live` should report
`fallbackUsed=false`; if it reports a 402, the key is fine but the account needs credit.
