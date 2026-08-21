ALTER TABLE "MemoryItem"
ADD COLUMN "title" TEXT NOT NULL DEFAULT '有限记忆',
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'user_saved',
ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'all_ai',
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "MemoryItem_userId_status_expiresAt_idx"
ON "MemoryItem"("userId", "status", "expiresAt");
