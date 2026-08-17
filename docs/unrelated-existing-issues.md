# Unrelated Existing Issues

## Historical administration checkpoint

`artifacts/checkpoints/admin-rebuild.json` is a historical `IN_PROGRESS`
checkpoint containing old claims and provider references. It is not current
acceptance evidence for Phase 2. Current browser/API/database evidence is in the
Phase 2 reports and capture directory.

## Database role limitation

The local PostgreSQL role `goodnight` cannot create a new database. Migration
acceptance therefore used a temporary schema inside `goodnight_treehole`, then
dropped that schema. The public schema reports up to date and a clean temporary
schema accepted all three migrations. Production still needs an operator-owned
backup and staging rollout.

## Redis version

The configured Windows Redis service is `127.0.0.1:6380`, version `5.0.14.1`.
BullMQ recommends Redis >= 6.2 and emits a warning. The real queue worker and
follow-up persistence tests passed on the installed service; upgrading Redis is
recommended before production load.

## Visual convergence

All 14 legacy front-reference captures pass the no-horizontal-overflow gate,
but image-diff rates remain between 10.42% and 22.25%. The largest divergence
is the diary reference page. This is a visual tuning backlog, not a functional
or persistence failure.
