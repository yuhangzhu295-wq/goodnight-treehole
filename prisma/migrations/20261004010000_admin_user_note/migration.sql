-- CreateTable
CREATE TABLE "AdminUserNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorAdminId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AdminUserNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminUserNote_userId_createdAt_idx" ON "AdminUserNote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminUserNote_userId_deletedAt_idx" ON "AdminUserNote"("userId", "deletedAt");

-- AddForeignKey
ALTER TABLE "AdminUserNote" ADD CONSTRAINT "AdminUserNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminUserNote" ADD CONSTRAINT "AdminUserNote_authorAdminId_fkey" FOREIGN KEY ("authorAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
