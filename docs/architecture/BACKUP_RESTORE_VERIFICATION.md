# Database backup and restore verification

Run 2026-10-20 03:08 (host clock). Restore verified into a scratch database and compared row by
row against the live one.

- Backup: `scripts/backup-db.ps1` → `C:\Users\zyu33\Backups\goodnight-treehole-db\goodnight_treehole-20261020-0308.dump`
  (542,720 bytes, custom format, 1,034 archive entries, 55 tables live). Report:
  `backup-db-20261020-0308.json`, `ok: true`, no failures.
- Restore: `pg_restore` (PostgreSQL 18 client, matching the server's dump version) into
  `restore_verify`. **161 `creating TABLE` statements**; one non-fatal error —
  `unrecognized configuration parameter "transaction_timeout"`, a PostgreSQL-18-only GUC that a
  PostgreSQL-16 server rejects. The dump's schema otherwise restored intact.
- Comparison: 23 tables counted on both sides, **all match**:

| Table | live | restored |
| --- | --- | --- |
| User | 23 | 23 |
| PrivacySetting | 23 | 23 |
| MemoryItem | 2 | 2 |
| DecisionRecord | 6 | 6 |
| Letter | 5 | 5 |
| MediaAsset | 2 | 2 |
| CooldownItem | 2 | 2 |
| MessageToFutureSelf | 3 | 3 |
| FollowUpJob | 13 | 13 |
| AIProvider | 4 | 4 |
| AIStyleRoute | 0 | 0 |
| Post | 7 | 7 |
| Mood | 11 | 11 |
| Diary | 6 | 6 |
| Reply | 11 | 11 |
| Favorite | 0 | 0 |
| UserNotification | 22 | 22 |
| AuditLog | 37 | 37 |
| MoodAttachment | 0 | 0 |
| DiaryAttachment | 0 | 0 |
| PeerReport | 0 | 0 |
| FeedbackTicket | 0 | 0 |

`AIStyleRoute` is 0 in both because the routes this branch writes are seeded per-instance at boot
after the provider policy (see `ensureAiRouteSeedCoverage`), and the dev instance has not booted
since; that is the live state, and the restore reproduces it rather than disagreeing with it.

**Known limitation.** The PostgreSQL-16 `pg_restore` inside the container cannot read a
PostgreSQL-18 `pg_dump` archive (`unsupported version (1.16) in file header`), so a restore has to
use the 18 client from the host. A restore-from-container-only runbook would need a version-matched
client.
