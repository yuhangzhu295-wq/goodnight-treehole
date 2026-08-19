-- Second-stage Peer Support Network: request context, explicit consent,
-- bounded conversation closure, feedback, reporting, and PII audit metadata.

-- AlterTable
ALTER TABLE "PeerMatch"
  ADD COLUMN "requestReason" TEXT,
  ADD COLUMN "requestQuestion" TEXT,
  ADD COLUMN "acceptedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PeerConversation"
  ADD COLUMN "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "consentAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "closedReason" TEXT,
  ADD COLUMN "feedback" TEXT,
  ADD COLUMN "feedbackNote" TEXT,
  ADD COLUMN "reportedAt" TIMESTAMP(3),
  ADD COLUMN "reporterUserId" TEXT,
  ADD COLUMN "reportReason" TEXT;

-- AlterTable
ALTER TABLE "PeerMessage" ADD COLUMN "piiFlags" JSONB;
