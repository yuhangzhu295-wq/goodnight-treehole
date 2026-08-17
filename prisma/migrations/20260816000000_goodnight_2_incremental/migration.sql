-- CreateEnum
CREATE TYPE "SupportIntent" AS ENUM ('JUST_LISTEN', 'FIND_PEOPLE', 'SEE_OUTCOMES', 'NEXT_STEP', 'STOP_IMPULSE', 'PREPARE_CONVERSATION', 'NOTHING_NOW', 'HIGH_DISTRESS');

-- AlterTable
ALTER TABLE "LifeJourney" ADD COLUMN     "currentIntent" "SupportIntent",
ADD COLUMN     "initialIntensity" INTEGER,
ADD COLUMN     "intentUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SituationSnapshot" ADD COLUMN     "behaviorSignals" JSONB,
ADD COLUMN     "contextTags" JSONB,
ADD COLUMN     "daysSinceEvent" INTEGER,
ADD COLUMN     "decisionContext" JSONB,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "eventStartedAt" TIMESTAMP(3),
ADD COLUMN     "eventType" TEXT,
ADD COLUMN     "fingerprintJson" JSONB,
ADD COLUMN     "intensity" INTEGER,
ADD COLUMN     "peopleContext" JSONB,
ADD COLUMN     "recoverySignals" JSONB,
ADD COLUMN     "stage" TEXT,
ADD COLUMN     "subDomain" TEXT,
ADD COLUMN     "urgency" INTEGER;

-- AlterTable
ALTER TABLE "JourneyUpdate" ADD COLUMN     "actionResult" TEXT,
ADD COLUMN     "contactState" TEXT,
ADD COLUMN     "decisionChange" TEXT,
ADD COLUMN     "eventDate" TIMESTAMP(3),
ADD COLUMN     "intensity" INTEGER,
ADD COLUMN     "lifeFunction" TEXT,
ADD COLUMN     "selfReportedHelpfulness" INTEGER,
ADD COLUMN     "sleepState" TEXT,
ADD COLUMN     "socialState" TEXT,
ADD COLUMN     "stage" TEXT;

-- AlterTable
ALTER TABLE "ActionCommitment" ADD COLUMN     "adaptationReason" TEXT,
ADD COLUMN     "attemptNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "parentActionId" TEXT;

-- AlterTable
ALTER TABLE "OutcomeCheckin" ADD COLUMN     "barrier" TEXT;

-- AlterTable
ALTER TABLE "PeerExperience" ADD COLUMN     "fingerprintJson" JSONB,
ADD COLUMN     "helpfulActions" JSONB,
ADD COLUMN     "laterSummary" JSONB,
ADD COLUMN     "notHelpfulActions" JSONB,
ADD COLUMN     "retrospective" TEXT,
ADD COLUMN     "subDomain" TEXT;

-- AlterTable
ALTER TABLE "PeerMatch" ADD COLUMN     "explanation" TEXT,
ADD COLUMN     "fingerprintSimilarity" DOUBLE PRECISION,
ADD COLUMN     "recoveryLead" INTEGER,
ADD COLUMN     "scoreBreakdown" JSONB,
ADD COLUMN     "stageDistance" INTEGER,
ADD COLUMN     "trustScore" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "UserNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "targetRoute" TEXT,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeerConversation" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "starterUserId" TEXT NOT NULL,
    "receiverUserId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "PeerConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeerMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorType" TEXT NOT NULL DEFAULT 'HUMAN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),

    CONSTRAINT "PeerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserNotification_userId_status_createdAt_idx" ON "UserNotification"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PeerConversation_matchId_key" ON "PeerConversation"("matchId");

-- CreateIndex
CREATE INDEX "PeerConversation_starterUserId_status_expiresAt_idx" ON "PeerConversation"("starterUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PeerConversation_receiverUserId_status_expiresAt_idx" ON "PeerConversation"("receiverUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "PeerMessage_conversationId_createdAt_idx" ON "PeerMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerConversation" ADD CONSTRAINT "PeerConversation_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "PeerMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerConversation" ADD CONSTRAINT "PeerConversation_starterUserId_fkey" FOREIGN KEY ("starterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerConversation" ADD CONSTRAINT "PeerConversation_receiverUserId_fkey" FOREIGN KEY ("receiverUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerMessage" ADD CONSTRAINT "PeerMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "PeerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerMessage" ADD CONSTRAINT "PeerMessage_senderUserId_fkey" FOREIGN KEY ("senderUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
