# USER NOTE VERIFICATION

ISSUE-027.

## The defect

"Save note" on a user in the admin wrote **only an `AuditLog` row**. The note the operator typed was
never business data, so it disappeared on the next load. Two separate faults made it invisible:

- `POST /api/admin/v1/users/:id/note` built a synthetic object `{id, note, tags, updatedAt}` and
  returned it without persisting anything.
- The admin drawer read `user.note`, which the user list payload never contained.

An audit row is a record that something happened; it is not the thing itself. The AuditLog cannot
stand in for the note.

## The model

`AdminUserNote` — a separate model rather than a text column on `User`:

| Field | Purpose |
| --- | --- |
| `id` | |
| `userId` | whose note; FK, cascade |
| `authorAdminId` | which operator wrote it; FK to AdminUser, restrict |
| `content` | the note |
| `createdAt`, `updatedAt` | |
| `deletedAt` | soft delete |

Indexes on `(userId, createdAt)` and `(userId, deletedAt)`.

## The rule, and why

Notes are **append-only**. Saving adds a row; the "current" note is the newest one that has not been
retracted. An earlier note is never overwritten. Deleting is a **soft** delete, so the record
survives for anyone who needs to know a note once existed.

This is the difference between the old behaviour and the new one in one sentence: the operator used to
replace a note they could not see, and now they add to a history they can.

## Operator surface

- `GET /api/admin/v1/users/:id/notes` — the non-retracted notes, newest first, plus `current`.
- `POST /api/admin/v1/users/:id/notes` — `{content}`, audited as `USER_NOTE_CREATE`.
- `DELETE /api/admin/v1/users/:id/notes/:noteId` — soft delete, audited as `USER_NOTE_DELETE`.
- The user list now carries each user's current note (`note`, `noteUpdatedAt`), which is what the
  drawer reads.
- `POST /api/admin/v1/users/:id/note` is **kept for compatibility** and now writes a real note row
  instead of only an audit entry, so nothing that calls the old route is left write-only.

The audit rows are kept alongside the notes. They are no longer the storage.

## Permissions

All three routes sit inside `AdminAuthGuard`. Read, write and delete each return 401 without a token,
and the note content is asserted absent from the public user-facing API.

## Verification

`work/verify-admin-user-note.mjs` — **22/22**:

| Check | Result |
| --- | --- |
| admin can create a note | 201 |
| a second note is a separate row, not an overwrite | two distinct ids |
| both notes are readable | items=2 |
| the older note is still intact (no overwrite) | found |
| the newest note is the current one | current = note 2 |
| the user list payload carries the current note | matches |
| the notes are real persisted rows | rows=2, author recorded |
| the write is still audited | `USER_NOTE_CREATE` rows=2 |
| the audit row and the note row are different records | distinct ids |
| admin can retract a note | 200, `deletedAt` set |
| a retracted note leaves the operator view | gone from the list, the earlier one becomes current |
| the retracted note is soft-deleted, not destroyed | row still on disk with `deletedAt` |
| the legacy note route now writes a real note row | 201, rows=1 |
| the notes survive a fresh admin login | present |
| reading / writing / deleting notes requires admin auth | 401, 401, 401 |
| no public endpoint exposes the operator note | probed 4 user-facing routes |
| an empty note is rejected | 400 |
| a note for an unknown user is rejected | 404 |

**Restart persistence.** The API was restarted and the notes compared against the database: every
user's notes reloaded with the same count (`user_demo: db=2, api=2`), the user list still carried the
current note, and the soft-deleted row was still on disk (3 rows total, 2 live). The store reloads
notes from PostgreSQL.

**In the browser** (`work/verify-admin-rc-ui.mjs`, 16/16): the drawer opens, the note history block
renders, saving appends to the visible history, the saved note is present in the API for that user,
deleting through the UI removes it, and the history refreshes.

## Residual

Notes are not editable in place — a correction is a new note. That is a deliberate consequence of
append-only: editing would reintroduce the "the old text is gone" problem in a smaller form. If
operators need an edit, the honest shape is an edit that records the previous content, not one that
replaces it.
