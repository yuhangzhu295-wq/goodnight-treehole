# Unrelated Existing Issues

## Historical Prisma migration chain

`prisma migrate deploy` is still blocked before the additive 2.0 migration by the
historical migration `20260808010000_hidden_post`, which references a `User` table
that is not present in the legacy migration sequence. This is an existing migration
history defect, not a change introduced by the 2.0 migration.

Current test and local evidence uses isolated PostgreSQL schemas provisioned with
the current Prisma schema (`prisma db push --force-reset`). The new migration remains
additive at `prisma/migrations/20260816000000_goodnight_2_incremental/migration.sql`.
Before a production deploy, repair or baseline the historical migration chain in a
staging database, then run `prisma migrate deploy` there.

## Historical administration checkpoint

`artifacts/checkpoints/admin-rebuild.json` remains a historical `IN_PROGRESS`
checkpoint and contains old claims and provider references. It is not used as current
acceptance evidence for 2.0. Current browser/API/database evidence is recorded in the
test reports referenced by the 2.0 final report.

## Visual convergence

All 14 legacy front-reference captures currently pass the no-horizontal-overflow
gate, but image-diff rates remain between 10.42% and 22.25%. The largest divergence
is the diary reference page. This is a visual tuning backlog rather than a functional
or persistence failure; it needs a separate reference-by-reference CSS/art pass.
