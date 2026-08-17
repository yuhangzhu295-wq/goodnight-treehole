-- GoodnightTreeHole 2.0 incremental domain upgrade.
-- Existing rows keep working because every link from legacy content is nullable.

CREATE TYPE "JourneyStatus" AS ENUM ('active', 'paused', 'completed', 'archived');
CREATE TYPE "PeerExperienceStatus" AS ENUM ('draft', 'pending_review', 'published', 'hidden', 'rejected');
CREATE TYPE "PeerMatchStatus" AS ENUM ('suggested', 'requested', 'connected', 'declined', 'blocked');
CREATE TYPE "ActionCommitmentStatus" AS ENUM ('active', 'completed', 'skipped', 'paused');
CREATE TYPE "CheckinStatus" AS ENUM ('pending', 'completed', 'missed');
CREATE TYPE "HandoffStatus" AS ENUM ('draft', 'ready', 'shared', 'completed');

ALTER TABLE "PrivacySetting"
  ADD COLUMN "allowPeerMatching" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowAnonymousExperienceStats" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowRecoveryData" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowJourneyLongTermAnalysis" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowLongTermMemory" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "LifeJourney" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "status" "JourneyStatus" NOT NULL DEFAULT 'active',
  "stage" TEXT NOT NULL DEFAULT 'clarifying',
  "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
  "intensity" INTEGER,
  "summary" TEXT,
  "nextReviewAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LifeJourney_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Mood" ADD COLUMN "journeyId" TEXT;
ALTER TABLE "Post" ADD COLUMN "journeyId" TEXT;
ALTER TABLE "Diary" ADD COLUMN "journeyId" TEXT;

CREATE TABLE "SituationSnapshot" (
  "id" TEXT NOT NULL,
  "journeyId" TEXT NOT NULL,
  "facts" JSONB NOT NULL,
  "feelings" JSONB NOT NULL,
  "needs" JSONB NOT NULL,
  "constraints" JSONB NOT NULL,
  "risks" JSONB NOT NULL,
  "confidence" TEXT NOT NULL DEFAULT 'user_confirmed',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SituationSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SituationSnapshot_journeyId_key" ON "SituationSnapshot"("journeyId");

CREATE TABLE "JourneyUpdate" (
  "id" TEXT NOT NULL, "journeyId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL, "content" TEXT NOT NULL, "payload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JourneyUpdate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "JourneyUpdate_journeyId_createdAt_idx" ON "JourneyUpdate"("journeyId", "createdAt");

CREATE TABLE "ActionCommitment" (
  "id" TEXT NOT NULL, "journeyId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "status" "ActionCommitmentStatus" NOT NULL DEFAULT 'active',
  "dueAt" TIMESTAMP(3), "reminderAt" TIMESTAMP(3), "evidence" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ActionCommitment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ActionCommitment_userId_status_dueAt_idx" ON "ActionCommitment"("userId", "status", "dueAt");
CREATE INDEX "ActionCommitment_journeyId_createdAt_idx" ON "ActionCommitment"("journeyId", "createdAt");

CREATE TABLE "OutcomeCheckin" (
  "id" TEXT NOT NULL, "journeyId" TEXT NOT NULL, "commitmentId" TEXT, "userId" TEXT NOT NULL,
  "status" "CheckinStatus" NOT NULL DEFAULT 'pending', "reflection" TEXT, "result" TEXT,
  "intensity" INTEGER, "checkedAt" TIMESTAMP(3), "dueAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutcomeCheckin_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OutcomeCheckin_journeyId_createdAt_idx" ON "OutcomeCheckin"("journeyId", "createdAt");
CREATE INDEX "OutcomeCheckin_userId_status_dueAt_idx" ON "OutcomeCheckin"("userId", "status", "dueAt");

CREATE TABLE "PeerExperience" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "title" TEXT NOT NULL,
  "domain" TEXT NOT NULL, "stage" TEXT NOT NULL, "content" TEXT NOT NULL, "tags" JSONB NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL, "status" "PeerExperienceStatus" NOT NULL DEFAULT 'draft',
  "reportCount" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PeerExperience_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PeerExperience_status_domain_stage_idx" ON "PeerExperience"("status", "domain", "stage");
CREATE INDEX "PeerExperience_userId_createdAt_idx" ON "PeerExperience"("userId", "createdAt");

CREATE TABLE "PeerMatch" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "peerExperienceId" TEXT NOT NULL,
  "score" DOUBLE PRECISION NOT NULL, "reasons" JSONB NOT NULL,
  "status" "PeerMatchStatus" NOT NULL DEFAULT 'suggested', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PeerMatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PeerMatch_userId_peerExperienceId_key" ON "PeerMatch"("userId", "peerExperienceId");
CREATE INDEX "PeerMatch_userId_status_createdAt_idx" ON "PeerMatch"("userId", "status", "createdAt");

CREATE TABLE "PeerReputation" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "helpfulCount" INTEGER NOT NULL DEFAULT 0,
  "reportCount" INTEGER NOT NULL DEFAULT 0, "restrictedUntil" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PeerReputation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PeerReputation_userId_key" ON "PeerReputation"("userId");

CREATE TABLE "DecisionRecord" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "question" TEXT NOT NULL,
  "options" JSONB NOT NULL, "criteria" JSONB NOT NULL, "decision" TEXT, "status" TEXT NOT NULL DEFAULT 'draft',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DecisionRecord_userId_status_updatedAt_idx" ON "DecisionRecord"("userId", "status", "updatedAt");

CREATE TABLE "CooldownItem" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "decisionId" TEXT, "title" TEXT NOT NULL,
  "reason" TEXT, "releaseAt" TIMESTAMP(3) NOT NULL, "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CooldownItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CooldownItem_userId_status_releaseAt_idx" ON "CooldownItem"("userId", "status", "releaseAt");

CREATE TABLE "RealityHandoff" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "recipient" TEXT NOT NULL,
  "channel" TEXT NOT NULL, "summary" TEXT NOT NULL, "status" "HandoffStatus" NOT NULL DEFAULT 'draft',
  "sharedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RealityHandoff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RealityHandoff_userId_status_updatedAt_idx" ON "RealityHandoff"("userId", "status", "updatedAt");

CREATE TABLE "TrustedContact" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "nickname" TEXT NOT NULL, "relation" TEXT NOT NULL,
  "contactHint" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrustedContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrustedContact_userId_enabled_idx" ON "TrustedContact"("userId", "enabled");

CREATE TABLE "MessageToFutureSelf" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "content" TEXT NOT NULL,
  "deliverAt" TIMESTAMP(3) NOT NULL, "deliveredAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MessageToFutureSelf_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MessageToFutureSelf_userId_deliverAt_idx" ON "MessageToFutureSelf"("userId", "deliverAt");

CREATE TABLE "PersonalSupportPlan" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "title" TEXT NOT NULL, "plan" JSONB NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PersonalSupportPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PersonalSupportPlan_userId_active_updatedAt_idx" ON "PersonalSupportPlan"("userId", "active", "updatedAt");

CREATE TABLE "MemoryItem" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "category" TEXT NOT NULL, "content" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3) NOT NULL, "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemoryItem_userId_expiresAt_idx" ON "MemoryItem"("userId", "expiresAt");

CREATE TABLE "RecoverySnapshot" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "summary" TEXT NOT NULL, "signals" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RecoverySnapshot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RecoverySnapshot_userId_createdAt_idx" ON "RecoverySnapshot"("userId", "createdAt");

CREATE TABLE "SafetyEvent" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "level" TEXT NOT NULL, "source" TEXT NOT NULL,
  "action" TEXT NOT NULL, "payload" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SafetyEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SafetyEvent_level_createdAt_idx" ON "SafetyEvent"("level", "createdAt");

CREATE TABLE "AgentDecisionLog" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "aiJobId" TEXT, "taskType" TEXT NOT NULL,
  "decision" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentDecisionLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentDecisionLog_taskType_createdAt_idx" ON "AgentDecisionLog"("taskType", "createdAt");

CREATE TABLE "FollowUpJob" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "journeyId" TEXT, "kind" TEXT NOT NULL, "dueAt" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending', "payload" JSONB, "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FollowUpJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FollowUpJob_status_dueAt_idx" ON "FollowUpJob"("status", "dueAt");

ALTER TABLE "Mood" ADD CONSTRAINT "Mood_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Diary" ADD CONSTRAINT "Diary_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LifeJourney" ADD CONSTRAINT "LifeJourney_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SituationSnapshot" ADD CONSTRAINT "SituationSnapshot_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JourneyUpdate" ADD CONSTRAINT "JourneyUpdate_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JourneyUpdate" ADD CONSTRAINT "JourneyUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActionCommitment" ADD CONSTRAINT "ActionCommitment_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActionCommitment" ADD CONSTRAINT "ActionCommitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OutcomeCheckin" ADD CONSTRAINT "OutcomeCheckin_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutcomeCheckin" ADD CONSTRAINT "OutcomeCheckin_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "ActionCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutcomeCheckin" ADD CONSTRAINT "OutcomeCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeerExperience" ADD CONSTRAINT "PeerExperience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeerExperience" ADD CONSTRAINT "PeerExperience_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PeerMatch" ADD CONSTRAINT "PeerMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PeerMatch" ADD CONSTRAINT "PeerMatch_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PeerMatch" ADD CONSTRAINT "PeerMatch_peerExperienceId_fkey" FOREIGN KEY ("peerExperienceId") REFERENCES "PeerExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PeerReputation" ADD CONSTRAINT "PeerReputation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CooldownItem" ADD CONSTRAINT "CooldownItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CooldownItem" ADD CONSTRAINT "CooldownItem_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "DecisionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RealityHandoff" ADD CONSTRAINT "RealityHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RealityHandoff" ADD CONSTRAINT "RealityHandoff_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrustedContact" ADD CONSTRAINT "TrustedContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageToFutureSelf" ADD CONSTRAINT "MessageToFutureSelf_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MessageToFutureSelf" ADD CONSTRAINT "MessageToFutureSelf_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PersonalSupportPlan" ADD CONSTRAINT "PersonalSupportPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalSupportPlan" ADD CONSTRAINT "PersonalSupportPlan_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecoverySnapshot" ADD CONSTRAINT "RecoverySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecoverySnapshot" ADD CONSTRAINT "RecoverySnapshot_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentDecisionLog" ADD CONSTRAINT "AgentDecisionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentDecisionLog" ADD CONSTRAINT "AgentDecisionLog_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Mood_journeyId_createdAt_idx" ON "Mood"("journeyId", "createdAt");
CREATE INDEX "Post_journeyId_createdAt_idx" ON "Post"("journeyId", "createdAt");
CREATE INDEX "Diary_journeyId_createdAt_idx" ON "Diary"("journeyId", "createdAt");
