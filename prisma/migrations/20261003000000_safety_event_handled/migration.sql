-- AlterTable
ALTER TABLE "SafetyEvent" ADD COLUMN     "handledAt" TIMESTAMP(3),
ADD COLUMN     "handledBy" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'open';
