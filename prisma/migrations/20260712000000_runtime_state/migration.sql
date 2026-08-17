-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('normal', 'limited', 'banned');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'PUBLIC');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('pending_review', 'published', 'hidden', 'rejected');

-- CreateEnum
CREATE TYPE "ReplyStatus" AS ENUM ('pending_review', 'published', 'blocked');

-- CreateEnum
CREATE TYPE "ReplyType" AS ENUM ('USER', 'AI');

-- CreateEnum
CREATE TYPE "AIStyle" AS ENUM ('warm', 'rational', 'light', 'clear', 'poetic');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('local', 'cloud', 'template');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'success', 'failed', 'fallback', 'fallback_completed', 'cancelled');

-- CreateEnum
CREATE TYPE "TargetType" AS ENUM ('post', 'letter', 'diary');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('open', 'processing', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "JourneyStatus" AS ENUM ('active', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "PeerExperienceStatus" AS ENUM ('draft', 'pending_review', 'published', 'hidden', 'rejected');

-- CreateEnum
CREATE TYPE "PeerMatchStatus" AS ENUM ('suggested', 'requested', 'connected', 'declined', 'blocked');

-- CreateEnum
CREATE TYPE "ActionCommitmentStatus" AS ENUM ('active', 'completed', 'skipped', 'paused');

-- CreateEnum
CREATE TYPE "CheckinStatus" AS ENUM ('pending', 'completed', 'missed');

-- CreateEnum
CREATE TYPE "HandoffStatus" AS ENUM ('draft', 'ready', 'shared', 'completed');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "anonymousCode" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "status" "AdminStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRole" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,

    CONSTRAINT "AdminRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivacySetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultVisibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "allowAnonymousPublic" BOOLEAN NOT NULL DEFAULT true,
    "allowHumanReplies" BOOLEAN NOT NULL DEFAULT true,
    "allowMonthlyReportShare" BOOLEAN NOT NULL DEFAULT true,
    "allowPeerMatching" BOOLEAN NOT NULL DEFAULT false,
    "allowAnonymousExperienceStats" BOOLEAN NOT NULL DEFAULT false,
    "allowRecoveryData" BOOLEAN NOT NULL DEFAULT false,
    "allowJourneyLongTermAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "allowLongTermMemory" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mood" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emotion" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "riskScore" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "journeyId" TEXT,

    CONSTRAINT "Mood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "moodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emotion" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "reviewStatus" "ReviewStatus" NOT NULL DEFAULT 'pending_review',
    "hugCount" INTEGER NOT NULL DEFAULT 0,
    "replyCount" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "journeyId" TEXT,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT,
    "type" "ReplyType" NOT NULL,
    "style" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "ReplyStatus" NOT NULL DEFAULT 'pending_review',
    "riskLevel" TEXT NOT NULL,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "aiJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Letter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceMoodId" TEXT,
    "legacySourceMoodId" TEXT,
    "style" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unread',
    "savedToDiary" BOOLEAN NOT NULL DEFAULT false,
    "aiJobId" TEXT,
    "generationStatus" TEXT,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Letter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Diary" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moodId" TEXT,
    "letterId" TEXT,
    "emotion" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "hasLetter" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "toolResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "journeyId" TEXT,

    CONSTRAINT "Diary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "JourneyUpdate" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JourneyUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionCommitment" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ActionCommitmentStatus" NOT NULL DEFAULT 'active',
    "dueAt" TIMESTAMP(3),
    "reminderAt" TIMESTAMP(3),
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActionCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutcomeCheckin" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "commitmentId" TEXT,
    "userId" TEXT NOT NULL,
    "status" "CheckinStatus" NOT NULL DEFAULT 'pending',
    "reflection" TEXT,
    "result" TEXT,
    "intensity" INTEGER,
    "checkedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutcomeCheckin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeerExperience" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "title" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "tags" JSONB NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "status" "PeerExperienceStatus" NOT NULL DEFAULT 'draft',
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeerExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeerMatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "peerExperienceId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "status" "PeerMatchStatus" NOT NULL DEFAULT 'suggested',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeerMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeerReputation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "restrictedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PeerReputation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecisionRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "criteria" JSONB NOT NULL,
    "decision" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CooldownItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "decisionId" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "releaseAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CooldownItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RealityHandoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "HandoffStatus" NOT NULL DEFAULT 'draft',
    "sharedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RealityHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedContact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "contactHint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrustedContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageToFutureSelf" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "content" TEXT NOT NULL,
    "deliverAt" TIMESTAMP(3) NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageToFutureSelf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalSupportPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "title" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalSupportPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoverySnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "summary" TEXT NOT NULL,
    "signals" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoverySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SafetyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentDecisionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "aiJobId" TEXT,
    "taskType" TEXT NOT NULL,
    "decision" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentDecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "journeyId" TEXT,
    "kind" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetType" "TargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "recordDays" INTEGER NOT NULL,
    "topEmotion" TEXT NOT NULL,
    "replyCount" INTEGER NOT NULL,
    "trendJson" JSONB NOT NULL,
    "distributionJson" JSONB NOT NULL,
    "keywordsJson" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportAdvice" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportAdvice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 0,
    "height" INTEGER NOT NULL DEFAULT 0,
    "usageType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoodAttachment" (
    "moodId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MoodAttachment_pkey" PRIMARY KEY ("moodId","mediaAssetId")
);

-- CreateTable
CREATE TABLE "DiaryAttachment" (
    "diaryId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DiaryAttachment_pkey" PRIMARY KEY ("diaryId","mediaAssetId")
);

-- CreateTable
CREATE TABLE "RuntimeState" (
    "id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuntimeState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackTicket" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sourcePage" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL,
    "screenshots" JSONB NOT NULL DEFAULT '[]',
    "reply" TEXT,
    "repliedBy" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedbackCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "FeedbackCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FaqItem" (
    "id" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FaqItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReplyPreset" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HugAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "presetCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HugAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenPost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HiddenPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "apiKeySecretRef" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "dailyLimit" INTEGER NOT NULL DEFAULT 1000,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 10,
    "failoverEnabled" BOOLEAN NOT NULL DEFAULT true,
    "usageTags" JSONB NOT NULL,
    "providerKind" TEXT NOT NULL DEFAULT 'other',
    "apiKeyStatus" TEXT NOT NULL DEFAULT 'missing',
    "failureRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgLatencyMs" INTEGER NOT NULL DEFAULT 0,
    "todayCalls" INTEGER NOT NULL DEFAULT 0,
    "modelMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIStyleRoute" (
    "id" TEXT NOT NULL,
    "style" "AIStyle" NOT NULL,
    "primaryProviderId" TEXT NOT NULL,
    "backupProviderId" TEXT NOT NULL,
    "fallbackTemplateId" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "promptTemplate" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "taskTypes" JSONB NOT NULL DEFAULT '[]',
    "routeVersion" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIStyleRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "taskType" TEXT,
    "style" "AIStyle" NOT NULL,
    "providerId" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "status" "AIJobStatus" NOT NULL,
    "promptSummary" TEXT NOT NULL,
    "promptVersion" TEXT,
    "result" TEXT,
    "structuredResult" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "fallbackUsed" BOOLEAN NOT NULL DEFAULT false,
    "routeVersion" INTEGER NOT NULL DEFAULT 0,
    "traceJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModerationLog" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "operatorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_openid_key" ON "User"("openid");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_username_key" ON "AdminUser"("username");

-- CreateIndex
CREATE UNIQUE INDEX "AdminRole_code_key" ON "AdminRole"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PrivacySetting_userId_key" ON "PrivacySetting"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_key" ON "SystemSetting"("key");

-- CreateIndex
CREATE INDEX "Mood_userId_createdAt_idx" ON "Mood"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Mood_emotion_visibility_idx" ON "Mood"("emotion", "visibility");

-- CreateIndex
CREATE INDEX "Mood_journeyId_createdAt_idx" ON "Mood"("journeyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_moodId_key" ON "Post"("moodId");

-- CreateIndex
CREATE INDEX "Post_reviewStatus_createdAt_idx" ON "Post"("reviewStatus", "createdAt");

-- CreateIndex
CREATE INDEX "Post_emotion_visibility_idx" ON "Post"("emotion", "visibility");

-- CreateIndex
CREATE INDEX "Post_journeyId_createdAt_idx" ON "Post"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "Reply_postId_status_idx" ON "Reply"("postId", "status");

-- CreateIndex
CREATE INDEX "Reply_type_status_idx" ON "Reply"("type", "status");

-- CreateIndex
CREATE INDEX "Letter_userId_createdAt_idx" ON "Letter"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Diary_userId_createdAt_idx" ON "Diary"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Diary_emotion_hasLetter_idx" ON "Diary"("emotion", "hasLetter");

-- CreateIndex
CREATE INDEX "Diary_journeyId_createdAt_idx" ON "Diary"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "LifeJourney_userId_status_updatedAt_idx" ON "LifeJourney"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "LifeJourney_domain_status_idx" ON "LifeJourney"("domain", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SituationSnapshot_journeyId_key" ON "SituationSnapshot"("journeyId");

-- CreateIndex
CREATE INDEX "JourneyUpdate_journeyId_createdAt_idx" ON "JourneyUpdate"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "ActionCommitment_userId_status_dueAt_idx" ON "ActionCommitment"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "ActionCommitment_journeyId_createdAt_idx" ON "ActionCommitment"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "OutcomeCheckin_journeyId_createdAt_idx" ON "OutcomeCheckin"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "OutcomeCheckin_userId_status_dueAt_idx" ON "OutcomeCheckin"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "PeerExperience_status_domain_stage_idx" ON "PeerExperience"("status", "domain", "stage");

-- CreateIndex
CREATE INDEX "PeerExperience_userId_createdAt_idx" ON "PeerExperience"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PeerMatch_userId_status_createdAt_idx" ON "PeerMatch"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PeerMatch_userId_peerExperienceId_key" ON "PeerMatch"("userId", "peerExperienceId");

-- CreateIndex
CREATE UNIQUE INDEX "PeerReputation_userId_key" ON "PeerReputation"("userId");

-- CreateIndex
CREATE INDEX "DecisionRecord_userId_status_updatedAt_idx" ON "DecisionRecord"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "CooldownItem_userId_status_releaseAt_idx" ON "CooldownItem"("userId", "status", "releaseAt");

-- CreateIndex
CREATE INDEX "RealityHandoff_userId_status_updatedAt_idx" ON "RealityHandoff"("userId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "TrustedContact_userId_enabled_idx" ON "TrustedContact"("userId", "enabled");

-- CreateIndex
CREATE INDEX "MessageToFutureSelf_userId_deliverAt_idx" ON "MessageToFutureSelf"("userId", "deliverAt");

-- CreateIndex
CREATE INDEX "PersonalSupportPlan_userId_active_updatedAt_idx" ON "PersonalSupportPlan"("userId", "active", "updatedAt");

-- CreateIndex
CREATE INDEX "MemoryItem_userId_expiresAt_idx" ON "MemoryItem"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "RecoverySnapshot_userId_createdAt_idx" ON "RecoverySnapshot"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SafetyEvent_level_createdAt_idx" ON "SafetyEvent"("level", "createdAt");

-- CreateIndex
CREATE INDEX "AgentDecisionLog_taskType_createdAt_idx" ON "AgentDecisionLog"("taskType", "createdAt");

-- CreateIndex
CREATE INDEX "FollowUpJob_status_dueAt_idx" ON "FollowUpJob"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Favorite_targetType_targetId_idx" ON "Favorite"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_targetType_targetId_key" ON "Favorite"("userId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyReport_userId_month_key" ON "MonthlyReport"("userId", "month");

-- CreateIndex
CREATE INDEX "MediaAsset_userId_usageType_idx" ON "MediaAsset"("userId", "usageType");

-- CreateIndex
CREATE INDEX "MoodAttachment_mediaAssetId_idx" ON "MoodAttachment"("mediaAssetId");

-- CreateIndex
CREATE INDEX "DiaryAttachment_mediaAssetId_idx" ON "DiaryAttachment"("mediaAssetId");

-- CreateIndex
CREATE INDEX "FeedbackTicket_status_priority_idx" ON "FeedbackTicket"("status", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "HugAction_userId_postId_presetCode_key" ON "HugAction"("userId", "postId", "presetCode");

-- CreateIndex
CREATE INDEX "HiddenPost_userId_createdAt_idx" ON "HiddenPost"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenPost_userId_postId_key" ON "HiddenPost"("userId", "postId");

-- CreateIndex
CREATE INDEX "AIProvider_enabled_priority_idx" ON "AIProvider"("enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "AIStyleRoute_style_key" ON "AIStyleRoute"("style");

-- CreateIndex
CREATE INDEX "AIJob_status_createdAt_idx" ON "AIJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AIJob_style_jobType_idx" ON "AIJob"("style", "jobType");

-- CreateIndex
CREATE INDEX "ModerationLog_targetType_targetId_idx" ON "ModerationLog"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "AuditLog_adminUserId_createdAt_idx" ON "AuditLog"("adminUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_resourceType_resourceId_idx" ON "AuditLog"("resourceType", "resourceId");

-- AddForeignKey
ALTER TABLE "AdminUser" ADD CONSTRAINT "AdminUser_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "AdminRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivacySetting" ADD CONSTRAINT "PrivacySetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mood" ADD CONSTRAINT "Mood_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mood" ADD CONSTRAINT "Mood_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_moodId_fkey" FOREIGN KEY ("moodId") REFERENCES "Mood"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_aiJobId_fkey" FOREIGN KEY ("aiJobId") REFERENCES "AIJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Letter" ADD CONSTRAINT "Letter_sourceMoodId_fkey" FOREIGN KEY ("sourceMoodId") REFERENCES "Mood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diary" ADD CONSTRAINT "Diary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diary" ADD CONSTRAINT "Diary_moodId_fkey" FOREIGN KEY ("moodId") REFERENCES "Mood"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diary" ADD CONSTRAINT "Diary_letterId_fkey" FOREIGN KEY ("letterId") REFERENCES "Letter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Diary" ADD CONSTRAINT "Diary_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LifeJourney" ADD CONSTRAINT "LifeJourney_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SituationSnapshot" ADD CONSTRAINT "SituationSnapshot_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyUpdate" ADD CONSTRAINT "JourneyUpdate_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JourneyUpdate" ADD CONSTRAINT "JourneyUpdate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionCommitment" ADD CONSTRAINT "ActionCommitment_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionCommitment" ADD CONSTRAINT "ActionCommitment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeCheckin" ADD CONSTRAINT "OutcomeCheckin_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeCheckin" ADD CONSTRAINT "OutcomeCheckin_commitmentId_fkey" FOREIGN KEY ("commitmentId") REFERENCES "ActionCommitment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutcomeCheckin" ADD CONSTRAINT "OutcomeCheckin_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerExperience" ADD CONSTRAINT "PeerExperience_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerExperience" ADD CONSTRAINT "PeerExperience_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerMatch" ADD CONSTRAINT "PeerMatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerMatch" ADD CONSTRAINT "PeerMatch_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerMatch" ADD CONSTRAINT "PeerMatch_peerExperienceId_fkey" FOREIGN KEY ("peerExperienceId") REFERENCES "PeerExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerReputation" ADD CONSTRAINT "PeerReputation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooldownItem" ADD CONSTRAINT "CooldownItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CooldownItem" ADD CONSTRAINT "CooldownItem_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "DecisionRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealityHandoff" ADD CONSTRAINT "RealityHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RealityHandoff" ADD CONSTRAINT "RealityHandoff_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedContact" ADD CONSTRAINT "TrustedContact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageToFutureSelf" ADD CONSTRAINT "MessageToFutureSelf_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageToFutureSelf" ADD CONSTRAINT "MessageToFutureSelf_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalSupportPlan" ADD CONSTRAINT "PersonalSupportPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalSupportPlan" ADD CONSTRAINT "PersonalSupportPlan_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryItem" ADD CONSTRAINT "MemoryItem_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoverySnapshot" ADD CONSTRAINT "RecoverySnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoverySnapshot" ADD CONSTRAINT "RecoverySnapshot_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SafetyEvent" ADD CONSTRAINT "SafetyEvent_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDecisionLog" ADD CONSTRAINT "AgentDecisionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDecisionLog" ADD CONSTRAINT "AgentDecisionLog_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_journeyId_fkey" FOREIGN KEY ("journeyId") REFERENCES "LifeJourney"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportAdvice" ADD CONSTRAINT "ReportAdvice_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "MonthlyReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoodAttachment" ADD CONSTRAINT "MoodAttachment_moodId_fkey" FOREIGN KEY ("moodId") REFERENCES "Mood"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoodAttachment" ADD CONSTRAINT "MoodAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryAttachment" ADD CONSTRAINT "DiaryAttachment_diaryId_fkey" FOREIGN KEY ("diaryId") REFERENCES "Diary"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiaryAttachment" ADD CONSTRAINT "DiaryAttachment_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackTicket" ADD CONSTRAINT "FeedbackTicket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedbackTicket" ADD CONSTRAINT "FeedbackTicket_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "FeedbackCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HugAction" ADD CONSTRAINT "HugAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HugAction" ADD CONSTRAINT "HugAction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenPost" ADD CONSTRAINT "HiddenPost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenPost" ADD CONSTRAINT "HiddenPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStyleRoute" ADD CONSTRAINT "AIStyleRoute_primaryProviderId_fkey" FOREIGN KEY ("primaryProviderId") REFERENCES "AIProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStyleRoute" ADD CONSTRAINT "AIStyleRoute_backupProviderId_fkey" FOREIGN KEY ("backupProviderId") REFERENCES "AIProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIStyleRoute" ADD CONSTRAINT "AIStyleRoute_fallbackTemplateId_fkey" FOREIGN KEY ("fallbackTemplateId") REFERENCES "AIProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIJob" ADD CONSTRAINT "AIJob_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
