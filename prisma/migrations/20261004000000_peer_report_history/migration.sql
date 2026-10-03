-- CreateTable
CREATE TABLE "PeerReport" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "experienceId" TEXT,
    "matchId" TEXT,
    "reporterUserId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "handledAt" TIMESTAMP(3),
    "handledBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeerReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PeerReport_conversationId_createdAt_idx" ON "PeerReport"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "PeerReport_experienceId_status_idx" ON "PeerReport"("experienceId", "status");

-- CreateIndex
CREATE INDEX "PeerReport_status_createdAt_idx" ON "PeerReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PeerReport_reporterUserId_createdAt_idx" ON "PeerReport"("reporterUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "PeerReport" ADD CONSTRAINT "PeerReport_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "PeerConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerReport" ADD CONSTRAINT "PeerReport_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "PeerExperience"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PeerReport" ADD CONSTRAINT "PeerReport_reporterUserId_fkey" FOREIGN KEY ("reporterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
