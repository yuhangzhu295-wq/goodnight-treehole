-- CreateTable: server-issued anonymous sessions (B3-R11)
--
-- The C-end credential used to be a bare user id in a header, which meant knowing any user id was
-- enough to act as that user. The replacement is a session the server issues and stores, so that a
-- credential can be expired, revoked on a lost device, and rotated, and so that two API instances
-- agree without sharing a cache.
--
-- Only the SHA-256 of the secret half is stored: a database read cannot be replayed as a credential.
-- Revoked rows are kept rather than deleted so the revocation stays auditable.
CREATE TABLE "AnonymousSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "rotatedFromId" TEXT,

    CONSTRAINT "AnonymousSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnonymousSession_userId_expiresAt_idx" ON "AnonymousSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AnonymousSession_deviceId_idx" ON "AnonymousSession"("deviceId");

-- AddForeignKey
ALTER TABLE "AnonymousSession" ADD CONSTRAINT "AnonymousSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
