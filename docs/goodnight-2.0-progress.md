# GoodnightTreeHole 2.0 Progress

## Delivery status

Status: implementation and current regression evidence complete.

The 2.0 work was delivered as an incremental extension of the existing front end,
admin application, API, and relational persistence layer. Existing legacy routes,
buttons, API contracts, and the DAPI-only AI policy remain in place.

## Completed phases

- Baseline and contracts: typed 2.0 domain contracts, Prisma schema and an additive
  migration were added without removing legacy domain records.
- Tonight and situation analysis: a database-backed Tonight home, LifeJourney,
  editable user-confirmed SituationSnapshot, and agent decision log are available.
- Actions and follow-up: ActionCommitment, outcome check-ins, timeline entries, and
  asynchronous FollowUpJob records are persisted.
- Peer network: moderated, anonymous peer experiences, matching, reputation, and
  graduation are supported only behind privacy consent.
- Life support: decision records, cooldown boxes, reality handoffs, trusted contacts,
  future messages, personal support plans, bounded memory, and recovery snapshots
  are implemented as persisted user data.
- Operations: admin routes for journeys, actions, check-ins, peer moderation, safety,
  support plans, and memory records read the same authoritative runtime source.
- Regression: lint, typecheck, unit/API/E2E, local visual capture, interaction
  diagnosis, click-all, business flow, cross-end flow, and `pnpm qa:all` have current
  PASS evidence.

## Active guardrails

- New AI tasks create asynchronous `AiJob` and `AgentDecisionLog` records and use
  approved remote DAPI providers only. No test uses Ollama or a local model.
- A user-confirmed situation snapshot is never overwritten by an AI update.
- Peer matching, anonymous experience statistics, recovery data, and long-term
  memory require their respective privacy flags.
- Safety and reality-handoff flows are routed to explicit human-support data, not
  presented as diagnosis or fabricated emergency assistance.

## Remaining repository work

See `docs/goodnight-2.0-final-report.md` and `docs/unrelated-existing-issues.md`.
The outstanding item is historical migration-chain repair; it does not invalidate
the isolated-schema runtime evidence collected for this delivery.
