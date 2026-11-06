ALTER TABLE "PrivacySetting"
ADD COLUMN "allowAiMemoryUse" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowAnonymousExperienceShare" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowJourneyArchiveRetention" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowFutureSelfNotifications" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowDataExport" BOOLEAN NOT NULL DEFAULT false;
