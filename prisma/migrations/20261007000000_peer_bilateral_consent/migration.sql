-- AlterTable: Add independent bilateral consent timestamps on PeerMatch
ALTER TABLE "PeerMatch"
  ADD COLUMN "requesterConsentAt" TIMESTAMP(3),
  ADD COLUMN "ownerConsentAt" TIMESTAMP(3);

-- Legacy rows grandfathering rule (§0.1, §0.4/A3):
-- Existing active conversations predating this migration are grandfathered as already-active
-- with the migration's own timestamp for the owner's consent. Legacy rows predating the migration
-- have no recorded requester consent and must NOT be represented as having given it
-- (requesterConsentAt remains NULL). Live conversations are not retroactively broken.
UPDATE "PeerMatch" m
SET "ownerConsentAt" = COALESCE(c."consentAcceptedAt", CURRENT_TIMESTAMP)
FROM "PeerConversation" c
WHERE c."matchId" = m.id AND c."status" = 'active';
